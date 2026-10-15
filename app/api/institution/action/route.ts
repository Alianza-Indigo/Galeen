import { NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { ApiError, reply, respondError, requireSameOrigin, requestJson,
  stringField, emailField, uuid, option, numberInt, branding } from "@/lib/http";
import { withInstitution, rolesManageMembers, rolesManageSettings,
  canSetMemberRole, canChangeCurrentMember, type InstitutionRole } from "@/lib/institution-access";
import { audit } from "@/lib/admin-records";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const roles=["owner","admin","manager","member","auditor"] as const;
const states=["active","suspended","revoked"] as const;

export async function POST(req:NextRequest) {
  try {
    requireSameOrigin(req);
    const data=await requestJson(req);
    const action=stringField(data.action,"Acción",3,60);
    const organizationId=uuid(data.organizationId);
    if(action==="invite_member") {
      return reply(await withInstitution(req,organizationId,rolesManageMembers,async({client,orgId,role,userId})=>{
        const email=emailField(data.email);
        const nextRole=option(data.role,roles,"Rol");
        if(!canSetMemberRole(role,nextRole as InstitutionRole))throw new ApiError(403,"No puedes asignar ese rol.");
        const days=numberInt(data.days??7,"Vigencia",1,30);
        const ent=await client.query("SELECT max_users FROM organization_entitlements WHERE organization_id=$1 FOR UPDATE",[orgId]);
        if(!ent.rows.length)throw new ApiError(409,"No se encontró el plan institucional.");
        const used=await client.query(
          "SELECT "+
          "(SELECT count(*)::int FROM organization_members WHERE organization_id=$1 AND status='active') "+
          "+ (SELECT count(*)::int FROM organization_invitations WHERE organization_id=$1 AND accepted_at IS NULL "+
          "AND revoked_at IS NULL AND expires_at>now()) AS used",[orgId]);
        if(Number(used.rows[0].used)>=Number(ent.rows[0].max_users))
          throw new ApiError(409,"Se alcanzó el máximo de usuarios.");
        const existing=await client.query(
          "SELECT 1 FROM organization_members m JOIN app_users u ON u.id=m.user_id "+
          "WHERE m.organization_id=$1 AND lower(u.email)=$2 AND m.status='active' LIMIT 1",[orgId,email]);
        if(existing.rows.length)throw new ApiError(409,"El usuario ya pertenece a la institución.");
        const pending=await client.query(
          "SELECT 1 FROM organization_invitations WHERE organization_id=$1 AND lower(email)=$2 "+
          "AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() LIMIT 1",[orgId,email]);
        if(pending.rows.length)throw new ApiError(409,"Ya existe una invitación vigente.");
        const token=randomBytes(32).toString("base64url");
        const digest=createHash("sha256").update(token).digest("hex");
        const invitation=await client.query(
          "INSERT INTO organization_invitations(organization_id,email,role,token_hash,invited_by,expires_at) "+
          "VALUES($1,$2,$3,$4,$5,now()+($6::int*interval '1 day')) RETURNING id",
          [orgId,email,nextRole,digest,userId,days]);
        await audit(client,orgId,"member.invited","invitation",invitation.rows[0].id,{role:nextRole},userId);
        return {ok:true,invitationPath:"/invite/"+token};
      }));
    }
    if(action==="revoke_invitation") {
      return reply(await withInstitution(req,organizationId,rolesManageMembers,async({client,orgId,role,userId})=>{
        const inviteId=uuid(data.invitationId);
        const current=await client.query("SELECT role FROM organization_invitations "+
          "WHERE organization_id=$1 AND id=$2 AND accepted_at IS NULL AND revoked_at IS NULL FOR UPDATE",[orgId,inviteId]);
        if(!current.rows.length)throw new ApiError(404,"No se encontró la invitación.");
        if(!canSetMemberRole(role,current.rows[0].role as InstitutionRole))throw new ApiError(403,"Sin permisos para revocar.");
        await client.query("UPDATE organization_invitations SET revoked_at=now() WHERE organization_id=$1 AND id=$2",[orgId,inviteId]);
        await audit(client,orgId,"member.invitation_revoked","invitation",inviteId,{},userId);
        return {ok:true};
      }));
    }
    if(action==="update_member") {
      return reply(await withInstitution(req,organizationId,rolesManageMembers,async({client,orgId,role,userId})=>{
        const memberId=uuid(data.userId);
        if(memberId===userId)throw new ApiError(409,"No puedes cambiar tus propios permisos.");
        const nextRole=option(data.role,roles,"Rol");
        const status=option(data.status,states,"Estado");
        const previous=await client.query("SELECT role,status FROM organization_members "+
          "WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",[orgId,memberId]);
        if(!previous.rows.length)throw new ApiError(404,"Miembro no encontrado.");
        if(!canChangeCurrentMember(role,previous.rows[0].role as InstitutionRole) ||
           !canSetMemberRole(role,nextRole as InstitutionRole))
          throw new ApiError(403,"No puedes modificar este miembro o asignarle ese rol.");
        if(status==="active" && previous.rows[0].status!=="active") {
          const maximum=await client.query(
            "SELECT max_users FROM organization_entitlements WHERE organization_id=$1 FOR UPDATE",[orgId]);
          const count=await client.query(
            "SELECT count(*)::int AS total FROM organization_members WHERE organization_id=$1 AND status='active'",[orgId]);
          if(Number(count.rows[0].total)>=Number(maximum.rows[0].max_users))
            throw new ApiError(409,"La institución alcanzó su límite de usuarios.");
        }
        await client.query(
          "UPDATE organization_members SET role=$3,status=$4 WHERE organization_id=$1 AND user_id=$2",
          [orgId,memberId,nextRole,status]);
        await audit(client,orgId,"member.updated","member",memberId,
          {role:nextRole,status},userId);
        return {ok:true};
      }));
    }
    if(action==="update_branding") {
      return reply(await withInstitution(req,organizationId,rolesManageSettings,async({client,orgId,userId})=>{
        const visual=branding(data.branding);
        await client.query(
          "UPDATE organizations SET branding=$2::jsonb,updated_at=now() WHERE id=$1",
          [orgId,JSON.stringify(visual)]);
        await audit(client,orgId,"organization.branding","organization",orgId,{},userId);
        return {ok:true};
      }));
    }
    if(action==="create_policy") {
      return reply(await withInstitution(req,organizationId,rolesManageMembers,async({client,orgId,userId})=>{
        const period=option(data.period,["daily","weekly","monthly"] as const,"Periodo");
        const maxRequests=numberInt(data.maxRequests,"Solicitudes",1,1000000000);
        const maxTokens=numberInt(data.maxTokens,"Tokens",1,9000000000000);
        const maxMicroUsd=numberInt(data.maxMicroUsd,"Presupuesto",1,9000000000000);
        const targetId=data.userId?uuid(data.userId):null;
        if(targetId) {
          const target=await client.query("SELECT 1 FROM organization_members WHERE "+
            "organization_id=$1 AND user_id=$2 AND status='active'",[orgId,targetId]);
          if(!target.rows.length)throw new ApiError(400,"El usuario no está activo en esta institución.");
        }
        const plan=await client.query("SELECT max_monthly_requests,max_monthly_micro_usd FROM "+
          "organization_entitlements WHERE organization_id=$1",[orgId]);
        if(!plan.rows.length)throw new ApiError(409,"Plan institucional no configurado.");
        // The plan ceiling is not raised by a delegated policy.
        if(period==="monthly" && (maxRequests>Number(plan.rows[0].max_monthly_requests) ||
           maxMicroUsd>Number(plan.rows[0].max_monthly_micro_usd))) {
          throw new ApiError(409,"La cuota mensual excede el plan institucional.");
        }
        const result=await client.query(
          "INSERT INTO usage_policies(organization_id,user_id,period,max_requests,max_effective_tokens,max_micro_usd) "+
          "VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          [orgId,targetId,period,maxRequests,maxTokens,maxMicroUsd]);
        await audit(client,orgId,"policy.created","usage_policy",result.rows[0].id,{period},userId);
        return {ok:true};
      }));
    }
    if(action==="delete_policy") {
      return reply(await withInstitution(req,organizationId,rolesManageMembers,async({client,orgId,userId})=>{
        const policyId=uuid(data.policyId);
        const result=await client.query("DELETE FROM usage_policies WHERE organization_id=$1 AND id=$2 RETURNING id",[orgId,policyId]);
        if(!result.rows.length)throw new ApiError(404,"Política no encontrada.");
        await audit(client,orgId,"policy.deleted","usage_policy",policyId,{},userId);
        return {ok:true};
      }));
    }
    throw new ApiError(400,"Acción no admitida.");
  } catch(err) { return respondError(err); }
}

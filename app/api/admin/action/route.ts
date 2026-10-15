import { NextRequest } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { transaction } from "@/lib/db";
import { ApiError, reply, respondError, requireAdmin, requireSameOrigin,
  requestJson, uuid, stringField, slugField, emailField, branding as parseBranding, numberInt } from "@/lib/http";
import { audit, orgStatus, role, memberStatus, entitlements } from "@/lib/admin-records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireOrg(client: import("pg").PoolClient, id: string, lock = false) {
  const result = await client.query("SELECT id,status FROM organizations WHERE id=$1"+(lock?" FOR UPDATE":""),[id]);
  if (!result.rows.length) throw new ApiError(404,"Institución no encontrada.");
  return result.rows[0] as {id:string;status:string};
}

export async function POST(req:NextRequest) {
  try {
    await requireAdmin(req);
    requireSameOrigin(req);
    const data = await requestJson(req);
    const action = stringField(data.action,"Acción",3,50);
    const result = await transaction(async client => {
      if (action === "create_organization") {
        const name = stringField(data.name,"Nombre",2,180);
        const slug = slugField(data.slug);
        const record = await client.query(
          "INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id,slug,name,status",
          [name,slug]);
        const org = record.rows[0] as {id:string;slug:string;name:string;status:string};
        await client.query("INSERT INTO organization_entitlements(organization_id) VALUES($1)",[org.id]);
        await audit(client,org.id,"organization.created","organization",org.id,{slug});
        return {organization:org};
      }
      const id=uuid(data.organizationId);
      const org=await requireOrg(client,id,true);
      if (action === "update_organization") {
        const name = stringField(data.name,"Nombre",2,180);
        const slug=slugField(data.slug);
        const status=orgStatus(data.status);
        await client.query(
          "UPDATE organizations SET name=$2,slug=$3,status=$4,updated_at=now() WHERE id=$1",
          [id,name,slug,status]);
        await audit(client,id,"organization.updated","organization",id,{status,slug});
        return {ok:true};
      }
      if (action === "update_branding") {
        const visual=parseBranding(data.branding);
        await client.query("UPDATE organizations SET branding=$2::jsonb,updated_at=now() WHERE id=$1",
          [id,JSON.stringify(visual)]);
        await audit(client,id,"organization.branding","organization",id);
        return {ok:true};
      }
      if (action === "update_entitlements") {
        const plan=entitlements(data.entitlements);
        const active=await client.query(
          "SELECT count(*)::int AS n FROM organization_members WHERE organization_id=$1 AND status='active'",[id]);
        if(Number(active.rows[0].n)>plan.maxUsers)throw new ApiError(409,"El límite es menor que los miembros activos.");
        await client.query(
          "INSERT INTO organization_entitlements(organization_id,plan_code,max_users,max_monthly_requests,max_monthly_micro_usd,allowed_providers,custom_domain_enabled,updated_at) "+
          "VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(organization_id) DO UPDATE SET "+
          "plan_code=EXCLUDED.plan_code,max_users=EXCLUDED.max_users,max_monthly_requests=EXCLUDED.max_monthly_requests,"+
          "max_monthly_micro_usd=EXCLUDED.max_monthly_micro_usd,allowed_providers=EXCLUDED.allowed_providers,"+
          "custom_domain_enabled=EXCLUDED.custom_domain_enabled,updated_at=now()",
          [id,plan.planCode,plan.maxUsers,plan.maxMonthlyRequests,plan.maxMonthlyMicroUsd,
           plan.allowedProviders,plan.customDomainEnabled]);
        await audit(client,id,"organization.entitlements","entitlements",id,
          {plan:plan.planCode,maxUsers:plan.maxUsers});
        return {ok:true};
      }
      if (action === "invite_member") {
        if(org.status!=="active")throw new ApiError(409,"Esta institución no está activa.");
        const email=emailField(data.email);
        const memberRole=role(data.role);
        const days=numberInt(data.days??7,"Vigencia",1,30);
        const max=await client.query("SELECT max_users FROM organization_entitlements WHERE organization_id=$1 FOR UPDATE",[id]);
        if(!max.rows.length)throw new ApiError(409,"Plan no configurado.");
        const users=await client.query(
          "SELECT count(*)::int AS n FROM organization_members WHERE organization_id=$1 AND status='active'",[id]);
        const pending=await client.query(
          "SELECT count(*)::int AS n FROM organization_invitations " +
          "WHERE organization_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()",[id]);
        if(Number(users.rows[0].n)+Number(pending.rows[0].n)>=Number(max.rows[0].max_users)) {
          throw new ApiError(409,"Se alcanzó el máximo de usuarios e invitaciones pendientes.");
        }
        const already=await client.query(
          "SELECT 1 FROM organization_members m JOIN app_users u ON u.id=m.user_id "+
          "WHERE m.organization_id=$1 AND lower(u.email)=$2 AND m.status='active' LIMIT 1",[id,email]);
        if(already.rows.length)throw new ApiError(409,"El usuario ya pertenece a esta institución.");
        const existing=await client.query(
          "SELECT 1 FROM organization_invitations WHERE organization_id=$1 AND lower(email)=$2 "+
          "AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() LIMIT 1",[id,email]);
        if(existing.rows.length)throw new ApiError(409,"Ya existe una invitación vigente para este correo.");
        const token=randomBytes(32).toString("base64url");
        const hashed=createHash("sha256").update(token).digest("hex");
        const invitation=await client.query(
          "INSERT INTO organization_invitations(organization_id,email,role,token_hash,expires_at) "+
          "VALUES($1,$2,$3,$4,now()+($5::int * interval '1 day')) RETURNING id,expires_at",
          [id,email,memberRole,hashed,days]);
        await audit(client,id,"member.invited","invitation",invitation.rows[0].id,{role:memberRole});
        return {invitationId:invitation.rows[0].id,expiresAt:invitation.rows[0].expires_at,
          invitationPath:"/invite/"+token};
      }
      if (action === "revoke_invitation") {
        const invitationId=uuid(data.invitationId);
        const changed=await client.query(
          "UPDATE organization_invitations SET revoked_at=now() "+
          "WHERE organization_id=$1 AND id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id",
          [id,invitationId]);
        if(!changed.rows.length)throw new ApiError(404,"Invitación no disponible.");
        await audit(client,id,"member.invitation_revoked","invitation",invitationId);
        return {ok:true};
      }
      if (action === "update_member") {
        const userId=uuid(data.userId);
        const newRole=role(data.role);
        const status=memberStatus(data.status);
        const member=await client.query(
          "SELECT role,status FROM organization_members WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",
          [id,userId]);
        if(!member.rows.length)throw new ApiError(404,"Miembro no encontrado.");
        const old=member.rows[0] as {role:string;status:string};
        if(old.role==="owner" && old.status==="active" && (newRole!=="owner"||status!=="active")) {
          const owners=await client.query(
            "SELECT count(*)::int AS n FROM organization_members "+
            "WHERE organization_id=$1 AND role='owner' AND status='active'",[id]);
          if(Number(owners.rows[0].n)<=1)throw new ApiError(409,"No se puede revocar el último propietario.");
        }
        if(status==="active" && old.status!=="active") {
          const max=await client.query(
            "SELECT max_users FROM organization_entitlements WHERE organization_id=$1 FOR UPDATE",[id]);
          const active=await client.query(
            "SELECT count(*)::int AS n FROM organization_members WHERE organization_id=$1 AND status='active'",[id]);
          if(Number(active.rows[0].n)>=Number(max.rows[0].max_users)) {
            throw new ApiError(409,"Se alcanzó el límite de usuarios.");
          }
        }
        await client.query(
          "UPDATE organization_members SET role=$3,status=$4 WHERE organization_id=$1 AND user_id=$2",
          [id,userId,newRole,status]);
        await audit(client,id,"member.updated","member",userId,{role:newRole,status});
        return {ok:true};
      }
      if (action === "update_usage_policy") {
        const period=String(data.period||"");
        if(!["daily","weekly","monthly"].includes(period))throw new ApiError(400,"Periodo inválido.");
        const requests=numberInt(data.maxRequests,"Solicitudes",1,1000000000);
        const microUsd=numberInt(data.maxMicroUsd,"Presupuesto",1,9000000000000);
        const tokens=numberInt(data.maxTokens,"Tokens",1,9000000000000);
        const userId=data.userId?uuid(data.userId):null;
        if(userId) {
          const exists=await client.query(
            "SELECT 1 FROM organization_members WHERE organization_id=$1 AND user_id=$2 AND status='active'",
            [id,userId]);
          if(!exists.rows.length)throw new ApiError(400,"El usuario no pertenece a la institución.");
        }
        const inserted=await client.query(
          "INSERT INTO usage_policies(organization_id,user_id,period,max_requests,max_micro_usd,max_effective_tokens) "+
          "VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          [id,userId,period,requests,microUsd,tokens]);
        await audit(client,id,"policy.created","usage_policy",inserted.rows[0].id,{period});
        return {policyId:inserted.rows[0].id};
      }
      if (action === "delete_usage_policy") {
        const policyId=uuid(data.policyId);
        const removed=await client.query(
          "DELETE FROM usage_policies WHERE organization_id=$1 AND id=$2 RETURNING id",
          [id,policyId]);
        if(!removed.rows.length)throw new ApiError(404,"Política no encontrada.");
        await audit(client,id,"policy.deleted","usage_policy",policyId);
        return {ok:true};
      }
      throw new ApiError(400,"Acción no admitida.");
    });
    return reply(result);
  }catch(err){return respondError(err);}
}

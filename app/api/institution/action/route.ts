import {NextRequest} from "next/server";
import {randomBytes,createHash} from "node:crypto";
import {ApiError,reply,respondError,requestJson,requireSameOrigin,emailField,numberInt,uuid,option,branding} from "@/lib/http";
import {within,managers,admins,canAssign,canModify, type Role} from "@/lib/institution-access";
import {audit} from "@/lib/admin-records";
export const runtime="nodejs";export const dynamic="force-dynamic";
const roles=["owner","admin","manager","member","auditor"] as const;
export async function POST(req:NextRequest){
 try{
 requireSameOrigin(req);const v=await requestJson(req);const action=String(v.action||"");
 const orgId=uuid(v.organizationId);
 if(action==="invite")return reply(await within(req,orgId,managers,async({db,userId,role})=>{
  const email=emailField(v.email),next=option(v.role,roles,"Rol");
  if(!canAssign(role,next as Role))throw new ApiError(403,"Rol no permitido.");
  const days=numberInt(v.days??7,"Días",1,30);
  const plan=await db.query("SELECT max_users FROM organization_entitlements WHERE organization_id=$1 FOR UPDATE",[orgId]);
  const count=await db.query("SELECT (SELECT count(*) FROM organization_members WHERE organization_id=$1 AND status='active')+(SELECT count(*) FROM organization_invitations WHERE organization_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()) AS total",[orgId]);
  if(Number(count.rows[0].total)>=Number(plan.rows[0].max_users))throw new ApiError(409,"Límite de usuarios alcanzado.");
  const found=await db.query("SELECT 1 FROM organization_members m JOIN app_users u ON u.id=m.user_id WHERE m.organization_id=$1 AND lower(u.email)=$2 AND m.status='active'",[orgId,email]);
  if(found.rows.length)throw new ApiError(409,"Usuario ya registrado.");
  const pending=await db.query("SELECT 1 FROM organization_invitations WHERE organization_id=$1 AND lower(email)=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()",[orgId,email]);
  if(pending.rows.length)throw new ApiError(409,"Invitación pendiente.");
  const token=randomBytes(32).toString("base64url");
  const hash=createHash("sha256").update(token).digest("hex");
  const added=await db.query("INSERT INTO organization_invitations(organization_id,email,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+($6::int * interval '1 day')) RETURNING id",[orgId,email,next,hash,userId,days]);
  await audit(db,orgId,"member.invited","invitation",added.rows[0].id,{role:next},userId);
  return {invitationPath:"/invite/"+token};
 }));
 if(action==="revoke_invite")return reply(await within(req,orgId,managers,async({db,userId,role})=>{
  const id=uuid(v.invitationId);
  const row=await db.query("SELECT role FROM organization_invitations WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL FOR UPDATE",[id,orgId]);
  if(!row.rows.length)throw new ApiError(404,"Invitación no encontrada.");
  if(!canAssign(role,row.rows[0].role as Role))throw new ApiError(403,"Sin permisos.");
  await db.query("UPDATE organization_invitations SET revoked_at=now() WHERE id=$1 AND organization_id=$2",[id,orgId]);
  await audit(db,orgId,"member.invitation_revoked","invitation",id,{},userId);return {ok:true};
 }));
 if(action==="update_member")return reply(await within(req,orgId,managers,async({db,userId,role})=>{
  const id=uuid(v.userId),next=option(v.role,roles,"Rol"),status=option(v.status,["active","suspended","revoked"] as const,"Estado");
  if(id===userId)throw new ApiError(409,"No puedes modificar tus propios permisos.");
  const row=await db.query("SELECT role,status FROM organization_members WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",[orgId,id]);
  if(!row.rows.length)throw new ApiError(404,"Miembro no encontrado.");
  if(!canModify(role,row.rows[0].role as Role)||!canAssign(role,next as Role))throw new ApiError(403,"Sin permisos.");
  if(status==="active"&&row.rows[0].status!=="active"){
   const plan=await db.query("SELECT max_users FROM organization_entitlements WHERE organization_id=$1 FOR UPDATE",[orgId]);
   const count=await db.query("SELECT count(*)::int AS total FROM organization_members WHERE organization_id=$1 AND status='active'",[orgId]);
   if(Number(count.rows[0].total)>=Number(plan.rows[0].max_users))throw new ApiError(409,"Límite de usuarios alcanzado.");
  }
  await db.query("UPDATE organization_members SET role=$3,status=$4 WHERE organization_id=$1 AND user_id=$2",[orgId,id,next,status]);
  await audit(db,orgId,"member.updated","member",id,{role:next,status},userId);return {ok:true};
 }));
 if(action==="branding")return reply(await within(req,orgId,admins,async({db,userId})=>{
  await db.query("UPDATE organizations SET branding=$2::jsonb,updated_at=now() WHERE id=$1",[orgId,JSON.stringify(branding(v.branding))]);
  await audit(db,orgId,"organization.branding","organization",orgId,{},userId);return {ok:true};
 }));
 if(action==="create_policy")return reply(await within(req,orgId,managers,async({db,userId})=>{
  const period=option(v.period,["daily","weekly","monthly"] as const,"Periodo");
  const maxRequests=numberInt(v.maxRequests,"Solicitudes",1,1000000000),maxTokens=numberInt(v.maxTokens,"Tokens",1,9000000000000),maxMicroUsd=numberInt(v.maxMicroUsd,"Presupuesto",1,9000000000000);
  const target=v.userId?uuid(v.userId):null;
  if(target){const exists=await db.query("SELECT 1 FROM organization_members WHERE organization_id=$1 AND user_id=$2 AND status='active'",[orgId,target]);if(!exists.rows.length)throw new ApiError(400,"Usuario no activo.");}
  const plan=await db.query("SELECT max_monthly_requests,max_monthly_micro_usd FROM organization_entitlements WHERE organization_id=$1",[orgId]);
  if(period==="monthly"&&(maxRequests>Number(plan.rows[0].max_monthly_requests)||maxMicroUsd>Number(plan.rows[0].max_monthly_micro_usd)))throw new ApiError(409,"La cuota supera el plan.");
  const policy=await db.query("INSERT INTO usage_policies(organization_id,user_id,period,max_requests,max_micro_usd,max_effective_tokens) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[orgId,target,period,maxRequests,maxMicroUsd,maxTokens]);
  await audit(db,orgId,"policy.created","usage_policy",policy.rows[0].id,{period},userId);return {ok:true};
 }));
 if(action==="delete_policy")return reply(await within(req,orgId,managers,async({db,userId})=>{
  const id=uuid(v.policyId);const removed=await db.query("DELETE FROM usage_policies WHERE organization_id=$1 AND id=$2 RETURNING id",[orgId,id]);
  if(!removed.rows.length)throw new ApiError(404,"Cuota no encontrada.");
  await audit(db,orgId,"policy.deleted","usage_policy",id,{},userId);return {ok:true};
 }));
 throw new ApiError(400,"Acción desconocida.");
 }catch(err){return respondError(err)}
}

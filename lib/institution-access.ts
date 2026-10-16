import type {NextRequest} from "next/server";
import type {PoolClient} from "pg";
import {transaction} from "@/lib/db";
import {ApiError,uuid} from "@/lib/http";
import {MEMBER_COOKIE,readMemberSession} from "@/lib/tenant-session";
export type Role="owner"|"admin"|"manager"|"member"|"auditor";
export async function within<T>(req:NextRequest,orgValue:unknown,allowed:readonly Role[],run:(c:{db:PoolClient;orgId:string;userId:string;role:Role})=>Promise<T>):Promise<T>{
 const orgId=uuid(orgValue),userId=readMemberSession(req.cookies.get(MEMBER_COOKIE)?.value);
 if(!userId)throw new ApiError(401,"Inicia sesión.");
 return transaction(async db=>{
  await db.query("SELECT set_config('galeen.tenant_id',$1,true)",[orgId]);
  const r=await db.query("SELECT m.role FROM organization_members m JOIN organizations o ON o.id=m.organization_id JOIN app_users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active' AND o.status='active' AND u.disabled_at IS NULL",[orgId,userId]);
  if(!r.rows.length)throw new ApiError(403,"No tienes acceso a esta institución.");
  const role=r.rows[0].role as Role;
  if(!allowed.includes(role))throw new ApiError(403,"Tu rol no permite esta operación.");
  return run({db,orgId,userId,role});
 });
}
export const allRoles:Role[]=["owner","admin","manager","member","auditor"];
export const managers:Role[]=["owner","admin","manager"];
export const admins:Role[]=["owner","admin"];
export function canAssign(actor:Role,target:Role){return actor==="owner"?target!=="owner":actor==="admin"?["admin","manager","member","auditor"].includes(target):actor==="manager"?["member","auditor"].includes(target):false}
export function canModify(actor:Role,target:Role){return actor==="owner"?target!=="owner":actor==="admin"?["manager","member","auditor"].includes(target):actor==="manager"?["member","auditor"].includes(target):false}

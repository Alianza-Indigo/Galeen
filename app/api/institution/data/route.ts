import {NextRequest} from "next/server";
import {reply,respondError} from "@/lib/http";
import {within,allRoles} from "@/lib/institution-access";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
 const result=await within(req,req.nextUrl.searchParams.get("organization"),allRoles,async({db,orgId,role,userId})=>{
 const org=await db.query("SELECT o.id,o.name,o.slug,o.branding,e.plan_code,e.max_users,e.max_monthly_requests,e.max_monthly_micro_usd,e.allowed_providers FROM organizations o JOIN organization_entitlements e ON e.organization_id=o.id WHERE o.id=$1",[orgId]);
 const statistics=await db.query("SELECT (SELECT count(*)::int FROM organization_members WHERE organization_id=$1 AND status='active') AS members,(SELECT count(*)::int FROM inference_requests WHERE organization_id=$1) AS requests,(SELECT count(*)::int FROM provider_connections WHERE organization_id=$1 AND enabled) AS connections",[orgId]);
 const privileged=["owner","admin","manager"].includes(role);
 const [members,invitations,policies,audit,connections]=await Promise.all([
 privileged?db.query("SELECT m.user_id,u.email,u.display_name,m.role,m.status FROM organization_members m JOIN app_users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY m.joined_at DESC LIMIT 300",[orgId]):Promise.resolve({rows:[]}),
 privileged?db.query("SELECT id,email,role,expires_at,revoked_at,accepted_at FROM organization_invitations WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100",[orgId]):Promise.resolve({rows:[]}),
 role!=="member"?db.query("SELECT id,user_id,period,max_requests,max_micro_usd,max_effective_tokens,enabled FROM usage_policies WHERE organization_id=$1 ORDER BY id DESC LIMIT 100",[orgId]):Promise.resolve({rows:[]}),
 ["owner","admin","auditor"].includes(role)?db.query("SELECT action,entity_type,created_at FROM audit_events WHERE organization_id=$1 ORDER BY id DESC LIMIT 100",[orgId]):Promise.resolve({rows:[]}),
 role!=="member"?db.query("SELECT id,provider,label,kind,enabled,health_status,credential_hint FROM provider_connections WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100",[orgId]):Promise.resolve({rows:[]})
 ]);
 return {organization:org.rows[0],statistics:statistics.rows[0],members:members.rows,invitations:invitations.rows,policies:policies.rows,audit:audit.rows,connections:connections.rows,role,userId};
 });
 return reply(result);
 }catch(err){return respondError(err)}
}

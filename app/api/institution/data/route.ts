import { NextRequest } from "next/server";
import { reply, respondError, ApiError } from "@/lib/http";
import { withInstitution, institutionalRoles } from "@/lib/institution-access";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(req:NextRequest) {
  try {
    const organizationId=req.nextUrl.searchParams.get("organization");
    const result=await withInstitution(req,organizationId,institutionalRoles,async({client,orgId,role,userId})=>{
      const base=await client.query(
        "SELECT o.id,o.name,o.slug,o.status,o.branding,e.plan_code,e.max_users,"+
        "e.max_monthly_requests,e.max_monthly_micro_usd,e.allowed_providers,e.custom_domain_enabled "+
        "FROM organizations o LEFT JOIN organization_entitlements e ON e.organization_id=o.id WHERE o.id=$1",
        [orgId]);
      if(!base.rows.length)throw new ApiError(404,"Institución no encontrada.");
      const org=base.rows[0];
      const stats=await client.query(
        "SELECT "+
        "(SELECT count(*)::int FROM organization_members WHERE organization_id=$1 AND status='active') AS active_users,"+
        "(SELECT count(*)::int FROM organization_invitations WHERE organization_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()) AS pending_invites,"+
        "(SELECT count(*)::int FROM provider_connections WHERE organization_id=$1 AND enabled) AS active_connections,"+
        "(SELECT count(*)::int FROM inference_requests WHERE organization_id=$1) AS total_requests,"+
        "(SELECT count(*)::int FROM inference_requests WHERE organization_id=$1 AND created_at>=date_trunc('month',now())) AS monthly_requests",
        [orgId]);
      const [members,invitations,policies,events,connections]=await Promise.all([
        ["owner","admin","manager"].includes(role)
          ?client.query("SELECT m.user_id,u.email,u.display_name,m.role,m.status,m.joined_at "+
             "FROM organization_members m JOIN app_users u ON u.id=m.user_id "+
             "WHERE m.organization_id=$1 ORDER BY m.joined_at DESC LIMIT 500",[orgId])
          :Promise.resolve({rows:[]}),
        ["owner","admin","manager"].includes(role)
          ?client.query("SELECT id,email,role,created_at,expires_at,revoked_at,accepted_at "+
             "FROM organization_invitations WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 150",[orgId])
          :Promise.resolve({rows:[]}),
        ["owner","admin","manager","auditor"].includes(role)
          ?client.query("SELECT id,user_id,period,max_requests,max_micro_usd,max_effective_tokens,enabled "+
            "FROM usage_policies WHERE organization_id=$1 ORDER BY id DESC LIMIT 150",[orgId])
          :Promise.resolve({rows:[]}),
        ["owner","admin","auditor"].includes(role)
          ?client.query("SELECT id,action,entity_type,entity_id,created_at "+
            "FROM audit_events WHERE organization_id=$1 ORDER BY id DESC LIMIT 100",[orgId])
          :Promise.resolve({rows:[]}),
        ["owner","admin","manager","auditor"].includes(role)
          ?client.query("SELECT id,provider,label,kind,enabled,created_at "+
            "FROM provider_connections WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100",[orgId])
          :Promise.resolve({rows:[]})
      ]);
      return {organization:org, role, currentUserId:userId,stats:stats.rows[0],
        members:members.rows,invitations:invitations.rows,policies:policies.rows,
        events:events.rows,connections:connections.rows};
    });
    return reply(result);
  } catch(err) { return respondError(err); }
}

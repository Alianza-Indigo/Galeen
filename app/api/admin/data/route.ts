import { NextRequest } from "next/server";
import { rows, one } from "@/lib/db";
import { ApiError, reply, respondError, requireAdmin, uuid } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const requested = req.nextUrl.searchParams.get("organization");
    const orgs = await rows(
      "SELECT o.id,o.slug,o.name,o.status,o.branding,o.created_at,o.updated_at," +
      "e.plan_code,e.max_users,e.max_monthly_requests,e.max_monthly_micro_usd,e.allowed_providers,e.custom_domain_enabled," +
      "(SELECT count(*)::int FROM organization_members m WHERE m.organization_id=o.id AND m.status='active') AS active_users," +
      "(SELECT count(*)::int FROM provider_connections p WHERE p.organization_id=o.id AND p.enabled) AS active_connections " +
      "FROM organizations o LEFT JOIN organization_entitlements e ON e.organization_id=o.id ORDER BY o.created_at DESC LIMIT 500"
    );
    if (!requested) {
      const stats = await one<{total_users:number;active_orgs:number;requests:number}>(
        "SELECT (SELECT count(*)::int FROM app_users WHERE disabled_at IS NULL) AS total_users," +
        "(SELECT count(*)::int FROM organizations WHERE status='active') AS active_orgs," +
        "(SELECT count(*)::int FROM inference_requests) AS requests"
      );
      return reply({ organizations: orgs, stats });
    }
    const id = uuid(requested);
    if (!orgs.some(o=>o.id===id)) throw new ApiError(404,"Institución no encontrada.");
    const [members,invitations,policies,events,providers] = await Promise.all([
      rows("SELECT m.organization_id,m.user_id,u.email,u.display_name,u.last_login_at,m.role,m.status,m.joined_at " +
        "FROM organization_members m JOIN app_users u ON u.id=m.user_id " +
        "WHERE m.organization_id=$1 ORDER BY m.joined_at DESC LIMIT 500",[id]),
      rows("SELECT id,email,role,expires_at,accepted_at,revoked_at,created_at FROM organization_invitations " +
        "WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 150",[id]),
      rows("SELECT id,user_id,period,max_requests,max_micro_usd,max_effective_tokens,enabled FROM usage_policies " +
        "WHERE organization_id=$1 ORDER BY id DESC LIMIT 150",[id]),
      rows("SELECT id,action,entity_type,entity_id,safe_metadata,created_at FROM audit_events " +
        "WHERE organization_id=$1 ORDER BY id DESC LIMIT 150",[id]),
      rows("SELECT id,provider,label,kind,enabled,created_at FROM provider_connections " +
        "WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 150",[id])
    ]);
    return reply({organizations:orgs,stats:null,members,invitations,policies,events,providers});
  } catch (err) { return respondError(err); }
}

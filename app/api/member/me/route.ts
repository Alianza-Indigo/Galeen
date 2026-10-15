import { NextRequest } from "next/server";
import { rows,one } from "@/lib/db";
import { ApiError, reply, respondError } from "@/lib/http";
import { MEMBER_COOKIE, readMemberSession } from "@/lib/tenant-session";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest) {
  try {
    const userId=readMemberSession(req.cookies.get(MEMBER_COOKIE)?.value);
    if(!userId)throw new ApiError(401,"Inicie sesión.");
    const person=await one<{id:string;email:string;display_name:string|null;disabled_at:string|null}>(
      "SELECT id,email,display_name,disabled_at FROM app_users WHERE id=$1",[userId]);
    if(!person||person.disabled_at)throw new ApiError(401,"La cuenta no está habilitada.");
    const institutions=await rows(
      "SELECT o.id,o.name,o.slug,o.status,o.branding,m.role,m.status AS membership_status,"+
      "e.plan_code,e.max_users,e.max_monthly_requests,e.max_monthly_micro_usd,e.allowed_providers "+
      "FROM organization_members m JOIN organizations o ON o.id=m.organization_id "+
      "LEFT JOIN organization_entitlements e ON e.organization_id=o.id "+
      "WHERE m.user_id=$1 AND m.status='active' AND o.status='active' ORDER BY o.name",[userId]
    );
    return reply({user:person,institutions});
  }catch(error){return respondError(error);}
}

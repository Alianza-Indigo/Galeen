import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { transaction } from "@/lib/db";
import { ApiError, uuid } from "@/lib/http";
import { MEMBER_COOKIE, readMemberSession } from "@/lib/tenant-session";

export const institutionalRoles = ["owner","admin","manager","auditor","member"] as const;
export type InstitutionRole = typeof institutionalRoles[number];
export type InstitutionContext = {
  client: PoolClient;
  userId: string;
  orgId: string;
  role: InstitutionRole;
};

export async function withInstitution<T>(
  request: NextRequest,
  orgValue: unknown,
  acceptedRoles: readonly InstitutionRole[],
  operation: (ctx: InstitutionContext) => Promise<T>
): Promise<T> {
  const orgId = uuid(orgValue);
  const userId = readMemberSession(request.cookies.get(MEMBER_COOKIE)?.value);
  if (!userId) throw new ApiError(401,"Inicia sesión con tu cuenta institucional.");

  return transaction(async client => {
    // Transaction-scoped tenant context, never persisted in the connection pool.
    await client.query("SELECT set_config('galeen.tenant_id',$1,true)",[orgId]);
    const { rows } = await client.query<{
      role: InstitutionRole; membership_status: string; organization_status:string
    }>(
      "SELECT m.role,m.status AS membership_status,o.status AS organization_status "+
      "FROM organization_members m "+
      "JOIN organizations o ON o.id=m.organization_id "+
      "JOIN app_users u ON u.id=m.user_id "+
      "WHERE m.organization_id=$1 AND m.user_id=$2 AND u.disabled_at IS NULL LIMIT 1",
      [orgId,userId]
    );
    const access=rows[0];
    if (!access || access.membership_status!=="active" || access.organization_status!=="active") {
      throw new ApiError(403,"No tienes acceso a esta institución.");
    }
    if (!acceptedRoles.includes(access.role)) {
      throw new ApiError(403,"Tu rol no permite esta operación.");
    }
    return operation({client, userId, orgId, role: access.role});
  });
}

export const rolesManageMembers = ["owner","admin","manager"] as const;
export const rolesManageSettings = ["owner","admin"] as const;
export const rolesReadAudit = ["owner","admin","manager","auditor"] as const;

export function canSetMemberRole(actor: InstitutionRole, nextRole: InstitutionRole) {
  return actor === "owner"
    ? nextRole !== "owner"
    : actor === "admin"
      ? ["admin","manager","member","auditor"].includes(nextRole)
      : actor === "manager"
        ? ["member","auditor"].includes(nextRole)
        : false;
}

export function canChangeCurrentMember(actor: InstitutionRole, currentRole: InstitutionRole) {
  if (currentRole==="owner") return false;
  if (actor==="owner") return true;
  if (actor==="admin") return currentRole!=="owner" && currentRole!=="admin";
  return actor==="manager" && ["member","auditor"].includes(currentRole);
}

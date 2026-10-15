import type { PoolClient } from "pg";
import { ApiError, numberInt, option, stringField } from "@/lib/http";

export const orgStatuses = ["active","suspended","closed"] as const;
export const roles = ["owner","admin","manager","member","auditor"] as const;
export const memberStatuses = ["active","invited","suspended","revoked"] as const;
export const providers = ["openai","anthropic","google","openrouter","custom"] as const;

export type Entitlements = {
  planCode: string;
  maxUsers: number;
  maxMonthlyRequests: number;
  maxMonthlyMicroUsd: number;
  allowedProviders: string[];
  customDomainEnabled: boolean;
};

export function entitlements(input: unknown): Entitlements {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400,"Debe indicar el plan y límites.");
  }
  const o = input as Record<string, unknown>;
  const allowed = o.allowedProviders;
  if (!Array.isArray(allowed) || allowed.some(v => typeof v !== "string" || !providers.includes(v as typeof providers[number]))) {
    throw new ApiError(400, "Proveedores permitidos inválidos.");
  }
  if (typeof o.customDomainEnabled !== "boolean") throw new ApiError(400, "Dominio personalizado inválido.");
  return {
    planCode: stringField(o.planCode,"Plan",2,64),
    maxUsers: numberInt(o.maxUsers,"Máximo de usuarios",1,1000000),
    maxMonthlyRequests: numberInt(o.maxMonthlyRequests,"Límite mensual de solicitudes",0,2000000000),
    maxMonthlyMicroUsd: numberInt(o.maxMonthlyMicroUsd,"Presupuesto mensual (micro USD)",0,9000000000000),
    allowedProviders: Array.from(new Set(allowed as string[])),
    customDomainEnabled: o.customDomainEnabled
  };
}
export function role(value: unknown) { return option(value,roles,"Rol"); }
export function orgStatus(value: unknown) { return option(value,orgStatuses,"Estado"); }
export function memberStatus(value: unknown) { return option(value,memberStatuses,"Estado del miembro"); }

export async function audit(
  client: PoolClient, tenant: string, action: string, entityType: string, entityId: string,
  metadata: Record<string, string|number|boolean|null> = {}, userId: string | null = null
) {
  await client.query(
    "INSERT INTO audit_events (organization_id,actor_user_id,action,entity_type,entity_id,safe_metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
    [tenant,userId,action,entityType,entityId,JSON.stringify(metadata)]
  );
}

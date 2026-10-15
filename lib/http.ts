import { NextRequest, NextResponse } from "next/server";
import { verifyEdgeSession, COOKIE_NAME } from "@/lib/admin-session-edge";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const noStore = { "Cache-Control": "no-store" };
export function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: noStore });
}
export function respondError(error: unknown) {
  if (error instanceof ApiError) return reply({ error: error.message }, error.status);
  if (typeof error === "object" && error && "code" in error && error.code === "23505") {
    return reply({ error: "Ya existe un registro con esos datos." }, 409);
  }
  console.error("[galeen:api] Request failed", { kind: error instanceof Error ? error.name : "unknown" });
  return reply({ error: "No se pudo completar la operación." }, 500);
}
export function requireSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    throw new ApiError(403, "Origen no autorizado.");
  }
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "Solicitud externa rechazada.");
  }
}
export async function requestJson(req: NextRequest, limit = 15000): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) throw new ApiError(415, "Solo se acepta JSON.");
  const text = await req.text();
  if (text.length > limit) throw new ApiError(413, "Solicitud demasiado grande.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new ApiError(400, "JSON inválido."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Se requiere un objeto JSON.");
  }
  return value as Record<string,unknown>;
}
export async function requireAdmin(req: NextRequest) {
  if (!await verifyEdgeSession(req.cookies.get(COOKIE_NAME)?.value)) {
    throw new ApiError(401, "Sesión de superadministrador requerida.");
  }
}
export function uuid(value: unknown): string {
  if (typeof value !== "string" ||
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, "Identificador inválido.");
  }
  return value.toLowerCase();
}
export function stringField(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") throw new ApiError(400, label + " es obligatorio.");
  const s = value.trim();
  if (s.length < min || s.length > max) throw new ApiError(400, label + ": longitud inválida.");
  return s;
}
export function emailField(value: unknown): string {
  const s = stringField(value, "Correo electrónico", 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ApiError(400, "Correo electrónico inválido.");
  return s;
}
export function slugField(value: unknown) {
  const slug = stringField(value,"Identificador",2,63).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) throw new ApiError(400,"Identificador inválido.");
  return slug;
}
export function option<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new ApiError(400,label + " inválido.");
  }
  return value as T;
}
export function numberInt(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ApiError(400,label+" debe ser entero entre "+min+" y "+max+".");
  }
  return value;
}
export function branding(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "El branding debe ser un objeto.");
  }
  const data = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  if (data.shortName !== undefined) result.shortName = stringField(data.shortName,"Nombre corto",0,80);
  if (data.primaryColor !== undefined) {
    if (typeof data.primaryColor !== "string" || !/^#[0-9a-f]{6}$/i.test(data.primaryColor)) {
      throw new ApiError(400,"Color principal inválido.");
    }
    result.primaryColor = data.primaryColor;
  }
  if (data.logoUrl !== undefined && data.logoUrl !== "") {
    if (typeof data.logoUrl !== "string" || data.logoUrl.length > 500) throw new ApiError(400,"URL de logotipo inválida.");
    let parsed: URL;
    try { parsed = new URL(data.logoUrl); } catch { throw new ApiError(400, "URL de logotipo inválida."); }
    if (parsed.protocol !== "https:" || !parsed.hostname.includes(".")) {
      throw new ApiError(400, "El logotipo requiere una URL HTTPS.");
    }
    result.logoUrl = data.logoUrl;
  }
  return result;
}

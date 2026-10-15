import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "galeen_admin";
export const SESSION_TTL = 8 * 60 * 60;

export function adminConfigured(): boolean {
  return Boolean(
    process.env.SUPERADMIN_USERNAME &&
    process.env.SUPERADMIN_PASSWORD &&
    (process.env.AUTH_SECRET?.length ?? 0) >= 32
  );
}

function isEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyCredentials(username: string, password: string): boolean {
  if (!adminConfigured()) return false;
  return isEqual(username, process.env.SUPERADMIN_USERNAME!) &&
    isEqual(password, process.env.SUPERADMIN_PASSWORD!);
}

export function mintSession(): string {
  if (!adminConfigured()) throw new Error("Admin environment is not configured");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ v: 1, role: "superadmin", iat: now, exp: now + SESSION_TTL })).toString("base64url");
  const signature = createHmac("sha256", process.env.AUTH_SECRET!).update(payload).digest("base64url");
  return payload + "." + signature;
}

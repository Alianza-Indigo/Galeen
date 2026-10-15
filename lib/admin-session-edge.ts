export const COOKIE_NAME = "galeen_admin";

export async function verifyEdgeSession(token?: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!token || token.length > 1500 || !secret || secret.length < 32 ||
      !process.env.SUPERADMIN_USERNAME || !process.env.SUPERADMIN_PASSWORD) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const bytes = signature.replace(/-/g, "+").replace(/_/g, "/");
    const sig = Uint8Array.from(atob(bytes.padEnd(Math.ceil(bytes.length / 4) * 4, "=")), x => x.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(payload));
    if (!valid) return false;
    const encoded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const data = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    const now = Math.floor(Date.now() / 1000);
    return data.v === 1 && data.role === "superadmin" &&
      Number.isInteger(data.iat) && Number.isInteger(data.exp) &&
      data.iat <= now && data.exp > now && data.exp - data.iat <= 28800;
  } catch { return false; }
}

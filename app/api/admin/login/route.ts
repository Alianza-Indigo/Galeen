import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, SESSION_TTL, adminConfigured, mintSession, verifyCredentials } from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  }
  if (!adminConfigured()) {
    return NextResponse.json({ error: "Configure el acceso en Vercel" }, { status: 503 });
  }
  let data: { username?: unknown; password?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 4096) return NextResponse.json({ error: "Solicitud demasiado larga" }, { status: 413 });
    data = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  if (typeof data.username !== "string" || typeof data.password !== "string" ||
      data.username.length > 128 || data.password.length > 512 ||
      !verifyCredentials(data.username, data.password)) {
    return NextResponse.json({ error: "Credenciales incorrectas" },
      { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(ADMIN_COOKIE, mintSession(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", maxAge: SESSION_TTL, path: "/"
  });
  return res;
}

import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({
    service: "galeen", status: "setup_required", productionReady: false,
    components: {
      frontend: "ready",
      tenantDatabase: process.env.DATABASE_URL ? "configured" : "not_configured",
      sessionSigning: process.env.AUTH_SECRET ? "configured" : "not_configured",
      providerVault: process.env.GALEEN_ENCRYPTION_KEY ? "configured" : "not_configured",
      billing: process.env.STRIPE_SECRET_KEY ? "configured" : "not_configured"
    },
    note: "La interfaz de configuracion no habilita operaciones hasta conectar y verificar el backend y los proveedores."
  }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { database } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const databaseConfigured=Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const sessionConfigured=Boolean(process.env.AUTH_SECRET);
  const vaultConfigured=Boolean(process.env.GALEEN_ENCRYPTION_KEY);
  let databaseConnected=false;
  if(databaseConfigured){
    try{
      await database().query("SELECT 1");
      databaseConnected=true;
    }catch{
      databaseConnected=false;
    }
  }
  const coreReady=databaseConnected&&sessionConfigured&&vaultConfigured;
  return NextResponse.json({
    service:"galeen",
    status:coreReady?"ready":"setup_required",
    productionReady:coreReady,
    components:{
      frontend:"ready",
      tenantDatabase:databaseConnected?"ready":databaseConfigured?"unavailable":"not_configured",
      sessionSigning:sessionConfigured?"configured":"not_configured",
      providerVault:vaultConfigured?"configured":"not_configured",
      billing:process.env.STRIPE_SECRET_KEY?"configured":"not_configured",
      localBroker:"available_requires_paired_agent"
    },
    note:"La disponibilidad de la plataforma no garantiza que haya un agente local conectado ni que el proveedor acepte solicitudes reales."
  },{status:coreReady?200:503,headers:{"Cache-Control":"no-store"}});
}

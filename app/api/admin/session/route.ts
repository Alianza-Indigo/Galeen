import { NextRequest } from "next/server";
import { reply, respondError, requireAdmin } from "@/lib/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest) {
  try { await requireAdmin(req); return reply({role:"superadmin",authenticated:true}); }
  catch(error) { return respondError(error); }
}

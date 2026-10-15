import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { ApiError, reply, respondError, requireSameOrigin, requestJson, uuid, stringField, option } from "@/lib/http";
import { withInstitution, rolesManageSettings } from "@/lib/institution-access";
import { providers, type ProviderName } from "@/lib/provider-types";
import { encryptCredential, decryptCredential } from "@/lib/provider-vault";
import { verifyProviderKey } from "@/lib/provider-verification";
import { audit } from "@/lib/admin-records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Connection = {
 id:string; provider:ProviderName; label:string; enabled:boolean; health_status:string;
 encrypted_credential:Buffer; nonce:Buffer; encryption_key_version:number;
 last_checked_at:Date|null
};

async function load(client:import("pg").PoolClient,org:string,id:string,lock=false) {
 const r=await client.query<Connection>(
  "SELECT id,provider,label,enabled,health_status,encrypted_credential,nonce,encryption_key_version,last_checked_at " +
  "FROM provider_connections WHERE organization_id=$1 AND id=$2" + (lock?" FOR UPDATE":""),
  [org,id]);
 if(!r.rows.length) throw new ApiError(404,"Conexión no encontrada.");
 return r.rows[0];
}
async function permit(client:import("pg").PoolClient,org:string,provider:ProviderName) {
 const r=await client.query<{allowed_providers:string[]}>(
  "SELECT allowed_providers FROM organization_entitlements WHERE organization_id=$1",[org]);
 if(!r.rows[0]?.allowed_providers.includes(provider))throw new ApiError(403,"Proveedor no permitido por el plan.");
}
function secret(value:unknown):string{
 if(typeof value!=="string")throw new ApiError(400,"Introduce la credencial.");
 return value;
}

export async function POST(req:NextRequest){
 try {
  requireSameOrigin(req);
  const body=await requestJson(req,8000);
  const action=option(body.action,["create","rename","rotate","test","toggle","remove"] as const,"Acción");
  const orgId=uuid(body.organizationId);
  if(action==="create"){
   return reply(await withInstitution(req,orgId,rolesManageSettings,async({client,orgId,userId})=>{
    const provider=option(body.provider,providers,"Proveedor");
    const label=stringField(body.label,"Nombre",2,100);
    await permit(client,orgId,provider);
    const num=await client.query<{n:number}>("SELECT count(*)::int AS n FROM provider_connections WHERE organization_id=$1",[orgId]);
    if(num.rows[0].n>=50)throw new ApiError(409,"Se alcanzó el máximo de conexiones.");
    const id=randomUUID();
    const secured=encryptCredential(orgId,id,secret(body.credential));
    await client.query(
     "INSERT INTO provider_connections(id,organization_id,provider,label,kind,encrypted_credential,nonce,encryption_key_version,credential_hint,enabled,health_status) " +
     "VALUES($1,$2,$3,$4,'official_api',$5,$6,$7,$8,false,'untested')",
     [id,orgId,provider,label,secured.encrypted,secured.nonce,secured.version,secured.hint]);
    await audit(client,orgId,"connection.created","provider_connection",id,{provider},userId);
    return {ok:true,id};
   }));
  }
  const connectionId=uuid(body.connectionId);
  if(action==="test"){
   const state=await withInstitution(req,orgId,rolesManageSettings,async({client,orgId})=>{
    const record=await load(client,orgId,connectionId);
    if(record.last_checked_at && Date.now()-new Date(record.last_checked_at).getTime()<20000)
     throw new ApiError(429,"Espera unos segundos antes de probar nuevamente.");
    await permit(client,orgId,record.provider);
    return {provider:record.provider, encrypted:record.encrypted_credential,nonce:record.nonce,version:record.encryption_key_version};
   });
   const credential=decryptCredential(orgId,connectionId,state.encrypted,state.nonce,state.version);
   const health=await verifyProviderKey(state.provider,credential);
   const didSave=await withInstitution(req,orgId,rolesManageSettings,async({client,orgId,userId})=>{
    const res=await client.query(
     "UPDATE provider_connections SET health_status=$4,last_checked_at=now(),updated_at=now()," +
     "enabled=CASE WHEN $4='healthy' THEN enabled ELSE false END " +
     "WHERE organization_id=$1 AND id=$2 AND encrypted_credential=$3 RETURNING id",
     [orgId,connectionId,state.encrypted,health]);
    if(res.rowCount)await audit(client,orgId,"connection.tested","provider_connection",connectionId,{status:health},userId);
    return Boolean(res.rowCount);
   });
   if(!didSave)throw new ApiError(409,"La credencial cambió durante la prueba.");
   return reply({ok:true,health});
  }
  return reply(await withInstitution(req,orgId,rolesManageSettings,async({client,orgId,userId})=>{
   const record=await load(client,orgId,connectionId,true);
   if(action==="rename"){
    const label=stringField(body.label,"Nombre",2,100);
    await client.query("UPDATE provider_connections SET label=$3,updated_at=now() WHERE organization_id=$1 AND id=$2",[orgId,connectionId,label]);
    await audit(client,orgId,"connection.renamed","provider_connection",connectionId,{},userId);
   }else if(action==="rotate"){
    const secured=encryptCredential(orgId,connectionId,secret(body.credential));
    await client.query("UPDATE provider_connections SET encrypted_credential=$3,nonce=$4,encryption_key_version=$5,credential_hint=$6,enabled=false,health_status='untested',last_checked_at=NULL,updated_at=now() WHERE organization_id=$1 AND id=$2",
      [orgId,connectionId,secured.encrypted,secured.nonce,secured.version,secured.hint]);
    await audit(client,orgId,"connection.rotated","provider_connection",connectionId,{},userId);
   }else if(action==="toggle"){
    if(typeof body.enabled!=="boolean")throw new ApiError(400,"Estado inválido.");
    if(body.enabled){
     await permit(client,orgId,record.provider);
     if(record.health_status!=="healthy"||!record.last_checked_at||
      Date.now()-new Date(record.last_checked_at).getTime()>86400000)
      throw new ApiError(409,"Prueba la conexión antes de activarla.");
    }
    await client.query("UPDATE provider_connections SET enabled=$3,updated_at=now() WHERE organization_id=$1 AND id=$2",
      [orgId,connectionId,body.enabled]);
    await audit(client,orgId,body.enabled?"connection.enabled":"connection.disabled","provider_connection",connectionId,{},userId);
   }else if(action==="remove"){
    await client.query("UPDATE provider_connections SET enabled=false,health_status='untested',updated_at=now() WHERE organization_id=$1 AND id=$2",
      [orgId,connectionId]);
    // Physical removal only if no requests refer to this connection.
    const uses=await client.query<{n:number}>("SELECT count(*)::int AS n FROM inference_requests WHERE organization_id=$1 AND connection_id=$2",[orgId,connectionId]);
    if(uses.rows[0].n>0)throw new ApiError(409,"La conexión tiene historial de uso. Desactívala en vez de eliminarla.");
    await client.query("DELETE FROM provider_connections WHERE organization_id=$1 AND id=$2",[orgId,connectionId]);
    await audit(client,orgId,"connection.removed","provider_connection",connectionId,{provider:record.provider},userId);
   }
   return {ok:true};
  }));
 }catch(error){return respondError(error)}
}

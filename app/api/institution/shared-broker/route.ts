import { NextRequest } from "next/server";
import { ApiError, reply, respondError, requireSameOrigin, requestJson, uuid, option, stringField } from "@/lib/http";
import { withInstitution } from "@/lib/institution-access";
import { encryptCredential, decryptCredential } from "@/lib/provider-vault";
import { verifyPoolKey, inferThroughPool } from "@/lib/eliza-pool";
import { audit } from "@/lib/admin-records";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const administrators=["owner","admin"] as const;
const allRoles=["owner","admin","manager","auditor","member"] as const;
type BrokerAccount={provider:string;status:string;connection_status:string;pool_key_encrypted:Buffer|null;pool_key_nonce:Buffer|null;pool_key_version:number|null;pool_model:string|null;pool_verified_at:Date|null};
function modelName(input:unknown){
 const s=stringField(input,"Modelo",2,100);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._:\/-]{1,99}$/.test(s))throw new ApiError(400,"Modelo inválido.");
 return s;
}
async function getAccount(client:import("pg").PoolClient,org:string,id:string,lock=false){
 const r=await client.query<BrokerAccount>(
  "SELECT provider,status,connection_status,pool_key_encrypted,pool_key_nonce,pool_key_version,pool_model,pool_verified_at "+
  "FROM shared_account_resources WHERE organization_id=$1 AND id=$2"+(lock?" FOR UPDATE":""),[org,id]);
 if(!r.rows.length)throw new ApiError(404,"Cuenta no encontrada.");
 return r.rows[0];
}

export async function POST(req:NextRequest){
 try{
  requireSameOrigin(req);
  const data=await requestJson(req,22000);
  const action=option(data.action,["save","test","disconnect","infer"] as const,"Acción");
  const orgId=uuid(data.organizationId),id=uuid(data.resourceId);
  if(action==="save"){
   return reply(await withInstitution(req,orgId,administrators,async({client,orgId,userId})=>{
    const account=await getAccount(client,orgId,id,true);
    if(!["openai","anthropic"].includes(account.provider))
      throw new ApiError(400,"El motor ElizaOS permite OpenAI y Anthropic en esta integración.");
    const key=stringField(data.poolKey,"Clave del motor",12,4000);
    const model=modelName(data.model);
    const encrypted=encryptCredential(orgId,id,key);
    await client.query(
      "UPDATE shared_account_resources SET pool_key_encrypted=$3,pool_key_nonce=$4,pool_key_version=$5,"+
      "pool_key_hint=$6,pool_model=$7,pool_verified_at=NULL,connection_status='pending_authorized_connector',"+
      "status='paused',updated_at=now() WHERE organization_id=$1 AND id=$2",
      [orgId,id,encrypted.encrypted,encrypted.nonce,encrypted.version,encrypted.hint,model]
    );
    await audit(client,orgId,"shared_account.broker_saved","shared_account",id,{},userId);
    return {ok:true};
   }));
  }
  if(action==="disconnect"){
   return reply(await withInstitution(req,orgId,administrators,async({client,orgId,userId})=>{
    await getAccount(client,orgId,id,true);
    await client.query(
      "UPDATE shared_account_resources SET pool_key_encrypted=NULL,pool_key_nonce=NULL,pool_key_version=NULL,"+
      "pool_key_hint=NULL,pool_model=NULL,pool_verified_at=NULL,connection_status='not_connected',"+
      "status='paused',updated_at=now() WHERE organization_id=$1 AND id=$2",[orgId,id]);
    await client.query("UPDATE shared_account_reservations SET status='released',ended_at=now() "+
      "WHERE organization_id=$1 AND resource_id=$2 AND status='active'",[orgId,id]);
    await audit(client,orgId,"shared_account.broker_disconnected","shared_account",id,{},userId);
    return {ok:true};
   }));
  }
  if(action==="test"){
   const account=await withInstitution(req,orgId,administrators,async({client,orgId})=>{
    const row=await getAccount(client,orgId,id);
    if(!row.pool_key_encrypted||!row.pool_key_nonce||!row.pool_key_version)
      throw new ApiError(409,"Configura la clave del motor.");
    return row;
   });
   const key=decryptCredential(orgId,id,account.pool_key_encrypted!,account.pool_key_nonce!,account.pool_key_version!);
   let verified=false;
   try{await verifyPoolKey(key);verified=true;}catch(e){
     if(e instanceof ApiError&&e.status===503)throw e;
   }
   const status=verified?"connected":"invalid";
   const updated=await withInstitution(req,orgId,administrators,async({client,orgId,userId})=>{
    const row=await client.query(
      "UPDATE shared_account_resources SET connection_status=$4,pool_verified_at=CASE WHEN $4='connected' "+
      "THEN now() ELSE NULL END, status=CASE WHEN $4='connected' THEN status ELSE 'paused' END,updated_at=now() "+
      "WHERE organization_id=$1 AND id=$2 AND pool_key_encrypted=$3 RETURNING id",
      [orgId,id,account.pool_key_encrypted,status]
    );
    if(row.rowCount)await audit(client,orgId,"shared_account.broker_tested","shared_account",id,{status},userId);
    return Boolean(row.rowCount);
   });
   if(!updated)throw new ApiError(409,"La credencial cambió durante la verificación.");
   return reply({ok:verified,status},verified?200:422);
  }

  const prompt=stringField(data.prompt,"Mensaje",1,12000);
  // Reservation is required: this endpoint does not hand provider secrets to clients.
  const execution=await withInstitution(req,orgId,allRoles,async({client,orgId,userId})=>{
   const account=await getAccount(client,orgId,id,true);
   if(account.status!=="active"||account.connection_status!=="connected"||
     !account.pool_key_encrypted||!account.pool_key_nonce||!account.pool_key_version||!account.pool_model)
     throw new ApiError(409,"Esta cuenta no tiene conexión activa al motor.");
   if(!["openai","anthropic"].includes(account.provider))
     throw new ApiError(400,"Proveedor no admitido por el motor.");
   const reservation=await client.query<{id:string}>(
     "SELECT id FROM shared_account_reservations WHERE organization_id=$1 AND resource_id=$2 "+
     "AND user_id=$3 AND status='active' AND expires_at>now() LIMIT 1",[orgId,id,userId]);
   if(!reservation.rows.length)throw new ApiError(403,"Debes reservar un turno activo.");
   await client.query(
     "UPDATE shared_account_executions SET state='failed',ended_at=now() "+
     "WHERE organization_id=$1 AND resource_id=$2 AND state='running' AND started_at<now()-interval '90 seconds'",
     [orgId,id]
   );
   const concurrent=await client.query<{count:number}>(
     "SELECT count(*)::int AS count FROM shared_account_executions "+
     "WHERE organization_id=$1 AND reservation_id=$2 AND state='running'",
     [orgId,reservation.rows[0].id]
   );
   if(concurrent.rows[0].count)throw new ApiError(409,"Ya hay una solicitud en curso en este turno.");
   const quota=await client.query<{max_monthly_requests:string}>(
     "SELECT max_monthly_requests FROM organization_entitlements WHERE organization_id=$1",[orgId]);
   if(!quota.rows.length)throw new ApiError(409,"Plan institucional no configurado.");
   const used=await client.query<{count:number}>(
     "SELECT count(*)::int AS count FROM shared_account_executions "+
     "WHERE organization_id=$1 AND started_at>=date_trunc('month',now()) AND state IN ('running','settled')",[orgId]);
   if(used.rows[0].count>=Number(quota.rows[0].max_monthly_requests))
     throw new ApiError(429,"Límite mensual institucional alcanzado.");
   const recent=await client.query<{count:number}>(
     "SELECT count(*)::int AS count FROM shared_account_executions "+
     "WHERE organization_id=$1 AND user_id=$2 AND started_at>now()-interval '1 minute'",[orgId,userId]);
   if(recent.rows[0].count>=8)throw new ApiError(429,"Demasiadas solicitudes. Prueba en un minuto.");
   const result=await client.query<{id:string}>(
     "INSERT INTO shared_account_executions(organization_id,resource_id,reservation_id,user_id,provider,model_id,state,input_characters) "+
     "VALUES($1,$2,$3,$4,$5,$6,'running',$7) RETURNING id",
     [orgId,id,reservation.rows[0].id,userId,account.provider,account.pool_model,prompt.length]);
   return {executionId:result.rows[0].id,provider:account.provider as "openai"|"anthropic",
    model:account.pool_model,encrypted:account.pool_key_encrypted,nonce:account.pool_key_nonce,
    version:account.pool_key_version};
  });

  try{
   const key=decryptCredential(orgId,id,execution.encrypted,execution.nonce,execution.version);
   const result=await inferThroughPool(execution.provider,execution.model,prompt,key);
   await withInstitution(req,orgId,allRoles,async({client,orgId})=>{
    await client.query(
     "UPDATE shared_account_executions SET state='settled',output_characters=$3,input_tokens=$4,output_tokens=$5,ended_at=now() "+
     "WHERE organization_id=$1 AND id=$2 AND state='running'",
     [orgId,execution.executionId,result.text.length,result.inputTokens,result.outputTokens]);
   });
   return reply({ok:true,text:result.text,usage:{inputTokens:result.inputTokens,outputTokens:result.outputTokens}});
  }catch(error){
   await withInstitution(req,orgId,allRoles,async({client,orgId})=>{
    await client.query(
     "UPDATE shared_account_executions SET state='failed',ended_at=now() "+
     "WHERE organization_id=$1 AND id=$2 AND state='running'",[orgId,execution.executionId]);
   }).catch(()=>{});
   throw error;
  }
 }catch(error){return respondError(error);}
}

import { randomBytes, randomUUID, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withInstitution, institutionalRoles } from "@/lib/institution-access";
import { transaction } from "@/lib/db";
import { ApiError, respondError, requireSameOrigin, requestJson, uuid, stringField } from "@/lib/http";
import { audit } from "@/lib/admin-records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const managers = ["owner","admin"];
const sha = value => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const respond = (body,status=200) => NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
function validModel(value){
 if(value===undefined||value===null||value==="")return null;
 if(typeof value!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{1,99}$/.test(value))
   throw new ApiError(400,"Modelo inválido.");
 return value;
}
async function ownerResource(client,org,id,lock=false){
 const res=await client.query("SELECT id,provider,status,max_concurrent FROM shared_account_resources WHERE organization_id=$1 AND id=$2"+(lock?" FOR UPDATE":""),[org,id]);
 if(!res.rows[0])throw new ApiError(404,"Recurso no encontrado.");
 if(!["openai","anthropic"].includes(res.rows[0].provider))throw new ApiError(400,"Proveedor no compatible con el agente.");
 return res.rows[0];
}
async function authenticatedAgent(req,body,callback){
 const token=req.headers.get("authorization")||"";
 const m=/^Bearer gba\.([0-9a-f-]{36})\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
 if(!m)throw new ApiError(401,"Agente no autorizado.");
 const org=uuid(m[1]),resource=uuid(m[2]);
 return transaction(async client=>{
   await client.query("SELECT set_config('galeen.tenant_id',$1,true)",[org]);
   const row=await client.query("SELECT a.resource_id,a.agent_kind,r.provider,r.status,r.max_concurrent FROM galeen_local_agents a JOIN shared_account_resources r ON r.organization_id=a.organization_id AND r.id=a.resource_id WHERE a.organization_id=$1 AND a.resource_id=$2 AND a.token_digest=$3 AND a.revoked_at IS NULL",[org,resource,sha(token)]);
   if(!row.rows[0])throw new ApiError(401,"Agente revocado o inválido.");
   return callback(client,{org,resource,provider:row.rows[0].provider,kind:row.rows[0].agent_kind,status:row.rows[0].status,capacity:row.rows[0].max_concurrent},body);
 });
}
async function agentAction(req,body){

 if(body.action==="agent.pair"){
  const code=String(body.code||"");
  const m=/^gbp\.([0-9a-f-]{36})\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(code);
  if(!m)throw new ApiError(401,"Código de emparejamiento inválido.");
  const org=uuid(m[1]),resource=uuid(m[2]),name=stringField(body.name,"Nombre del agente",1,100);
  const kind=body.kind==="browser"?"browser":"cli";
  const newToken="gba."+org+"."+resource+"."+secret();
  await transaction(async client=>{
   await client.query("SELECT set_config('galeen.tenant_id',$1,true)",[org]);
   const pair=await client.query("DELETE FROM galeen_local_pairings WHERE organization_id=$1 AND resource_id=$2 AND code_digest=$3 AND expires_at>now() RETURNING resource_id",[org,resource,sha(code)]);
   if(!pair.rows.length)throw new ApiError(401,"Código vencido o utilizado.");
   await ownerResource(client,org,resource,true);
   await client.query("INSERT INTO galeen_local_agents(organization_id,resource_id,token_digest,agent_name,agent_kind) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,resource_id) DO UPDATE SET token_digest=EXCLUDED.token_digest,agent_name=EXCLUDED.agent_name,agent_kind=EXCLUDED.agent_kind,revoked_at=NULL,last_seen_at=NULL,created_at=now()",[org,resource,sha(newToken),name,kind]);
  });
  return respond({ok:true,token:newToken,organizationId:org,resourceId:resource,kind});
 }
 return respond(await authenticatedAgent(req,body,async(client,agent,data)=>{
  const p=[agent.org,agent.resource];
  if(data.action==="agent.heartbeat"){
   const jobId=data.jobId?uuid(data.jobId):null;
   const runId=data.runId?uuid(data.runId):null;
   if(Boolean(jobId)!==Boolean(runId))throw new ApiError(400,"Identificadores incompletos.");
   await client.query("UPDATE galeen_local_agents SET last_seen_at=now() WHERE organization_id=$1 AND resource_id=$2",p);
   if(jobId){
    const updated=await client.query("UPDATE galeen_local_jobs j SET lease_expires_at=now()+interval '180 seconds',updated_at=now() WHERE j.organization_id=$1 AND j.resource_id=$2 AND j.id=$3 AND j.run_id=$4 AND j.state='running' AND j.lease_expires_at>now() AND EXISTS(SELECT 1 FROM shared_account_reservations r JOIN shared_account_members m ON m.organization_id=r.organization_id AND m.resource_id=r.resource_id AND m.user_id=r.user_id WHERE r.id=j.reservation_id AND r.organization_id=j.organization_id AND r.resource_id=j.resource_id AND r.user_id=j.user_id AND r.status='active' AND r.expires_at>now() AND m.status='active') RETURNING j.id",[...p,jobId,runId]);
    if(!updated.rows.length)throw new ApiError(409,"Trabajo cancelado o vencido.");
   }
   return {ok:true};
  }
  if(data.action==="agent.claim"){
   const limit=Number(data.limit??1);
   if(!Number.isInteger(limit)||limit<1||limit>50)throw new ApiError(400,"Lote inválido.");
   // Serialize all claims per resource, including across Vercel instances.
   const resource=await ownerResource(client,agent.org,agent.resource,true);
   await client.query("UPDATE galeen_local_agents SET last_seen_at=now() WHERE organization_id=$1 AND resource_id=$2",p);
   if(resource.status!=="active")return {ok:true,jobs:[],capacity:resource.max_concurrent};
   await client.query("UPDATE galeen_local_jobs SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error=CASE WHEN attempts>=3 THEN 'Sin respuesta del agente' ELSE NULL END,run_id=NULL,lease_expires_at=NULL,finished_at=CASE WHEN attempts>=3 THEN now() ELSE NULL END,updated_at=now() WHERE organization_id=$1 AND resource_id=$2 AND state='running' AND lease_expires_at<=now()",p);
   // Any revoked assignment, membership or reservation invalidates the job.
   await client.query("UPDATE galeen_local_jobs j SET state='canceled',run_id=NULL,lease_expires_at=NULL,finished_at=now(),updated_at=now() WHERE j.organization_id=$1 AND j.resource_id=$2 AND j.state IN ('queued','running') AND NOT EXISTS (SELECT 1 FROM shared_account_reservations r JOIN shared_account_members m ON m.organization_id=r.organization_id AND m.resource_id=r.resource_id AND m.user_id=r.user_id JOIN organization_members om ON om.organization_id=r.organization_id AND om.user_id=r.user_id JOIN app_users u ON u.id=r.user_id WHERE r.id=j.reservation_id AND r.organization_id=j.organization_id AND r.resource_id=j.resource_id AND r.user_id=j.user_id AND r.status='active' AND r.expires_at>now() AND m.status='active' AND om.status='active' AND u.disabled_at IS NULL)",p);
   const active=await client.query("SELECT count(*)::int AS n FROM galeen_local_jobs WHERE organization_id=$1 AND resource_id=$2 AND state='running' AND lease_expires_at>now()",p);
   const available=Math.max(0,Math.min(limit,resource.max_concurrent-Number(active.rows[0].n)));
   if(!available)return {ok:true,jobs:[],running:Number(active.rows[0].n),capacity:resource.max_concurrent};
   const picked=await client.query("SELECT id,prompt,model_id FROM galeen_local_jobs WHERE organization_id=$1 AND resource_id=$2 AND state='queued' ORDER BY created_at ASC LIMIT $3 FOR UPDATE SKIP LOCKED",[...p,available]);
   const jobs=[];
   for(const j of picked.rows){
    const runId=randomUUID();
    await client.query("UPDATE galeen_local_jobs SET state='running',run_id=$2,attempts=attempts+1,lease_expires_at=now()+interval '180 seconds',updated_at=now() WHERE id=$1",[j.id,runId]);
    jobs.push({jobId:j.id,runId,prompt:j.prompt,model:j.model_id,provider:agent.provider==="openai"?"codex":"claude"});
   }
   return {ok:true,jobs,capacity:resource.max_concurrent,running:Number(active.rows[0].n)+jobs.length};
  }
  if(data.action==="agent.finish"){
   const jobId=uuid(data.jobId),runId=uuid(data.runId),success=data.ok===true;
   const output=success?stringField(data.output,"Respuesta",1,55000):null;
   const error=success?null:stringField(data.error,"Error",1,500);
   const result=await client.query("UPDATE galeen_local_jobs j SET state=$5,result=$6,error=$7,run_id=NULL,lease_expires_at=NULL,finished_at=now(),updated_at=now() WHERE j.organization_id=$1 AND j.resource_id=$2 AND j.id=$3 AND j.run_id=$4 AND j.state='running' AND j.lease_expires_at>now() AND EXISTS (SELECT 1 FROM shared_account_reservations r JOIN shared_account_members m ON m.organization_id=r.organization_id AND m.resource_id=r.resource_id AND m.user_id=r.user_id WHERE r.id=j.reservation_id AND r.organization_id=j.organization_id AND r.resource_id=j.resource_id AND r.user_id=j.user_id AND r.status='active' AND r.expires_at>now() AND m.status='active') RETURNING j.id",[...p,jobId,runId,success?"completed":"failed",output,error]);
   if(!result.rows.length)throw new ApiError(409,"Ejecución no vigente.");
   await client.query("UPDATE galeen_local_agents SET last_seen_at=now() WHERE organization_id=$1 AND resource_id=$2",p);
   return {ok:true};
  }
  throw new ApiError(400,"Acción del agente inválida.");
 }));
}

export async function GET(req){
 try{
  const org=uuid(req.nextUrl.searchParams.get("organizationId")),id=uuid(req.nextUrl.searchParams.get("resourceId"));
  return respond(await withInstitution(req,org,institutionalRoles,async({client,userId,role,orgId})=>{
   await ownerResource(client,orgId,id);
   const agent=await client.query("SELECT agent_name,last_seen_at,revoked_at,created_at FROM galeen_local_agents WHERE organization_id=$1 AND resource_id=$2",[orgId,id]);
   const manager=managers.includes(role);
   const jobs=await client.query("SELECT id,user_id,state,result,error,created_at,finished_at FROM galeen_local_jobs WHERE organization_id=$1 AND resource_id=$2"+(manager?"":" AND user_id=$3")+" ORDER BY created_at DESC LIMIT 40",manager?[orgId,id]:[orgId,id,userId]);
   return {enabled:true,agent:agent.rows[0]||null,jobs:jobs.rows};
  }));
 }catch(e){return respondError(e);}
}

export async function POST(req){
 try{
  const body=await requestJson(req,75000);
  if(typeof body.action!=="string")throw new ApiError(400,"Acción requerida.");
  if(body.action.startsWith("agent."))return await agentAction(req,body);
  requireSameOrigin(req);
  const org=uuid(body.organizationId),id=uuid(body.resourceId);
  if(body.action==="pair")return respond(await withInstitution(req,org,managers,async({client,orgId,userId})=>{
   await ownerResource(client,orgId,id,true);
   const code="gbp."+orgId+"."+id+"."+secret();
   await client.query("INSERT INTO galeen_local_pairings(organization_id,resource_id,code_digest,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes') ON CONFLICT (organization_id,resource_id) DO UPDATE SET code_digest=EXCLUDED.code_digest,expires_at=EXCLUDED.expires_at",[orgId,id,sha(code)]);
   await audit(client,orgId,"local_broker.pair_created","shared_account",id,{},userId);
   return {ok:true,code};
  }));
  if(body.action==="disconnect")return respond(await withInstitution(req,org,managers,async({client,orgId,userId})=>{
   await ownerResource(client,orgId,id,true);
   await client.query("UPDATE galeen_local_agents SET revoked_at=now() WHERE organization_id=$1 AND resource_id=$2",[orgId,id]);
   await client.query("UPDATE galeen_local_jobs SET state='canceled',run_id=NULL,lease_expires_at=NULL,updated_at=now(),finished_at=now() WHERE organization_id=$1 AND resource_id=$2 AND state IN ('queued','running')",[orgId,id]);
   await audit(client,orgId,"local_broker.disconnected","shared_account",id,{},userId);
   return {ok:true};
  }));
  if(body.action==="submit")return respond(await withInstitution(req,org,institutionalRoles,async({client,orgId,userId})=>{
   const account=await ownerResource(client,orgId,id,true);
   if(account.status!=="active")throw new ApiError(409,"Activa primero el recurso.");
   const prompt=stringField(body.prompt,"Mensaje",1,12000),model=validModel(body.model);
   const reservation=await client.query("SELECT r.id FROM shared_account_reservations r JOIN shared_account_members m ON m.organization_id=r.organization_id AND m.resource_id=r.resource_id AND m.user_id=r.user_id WHERE r.organization_id=$1 AND r.resource_id=$2 AND r.user_id=$3 AND r.status='active' AND r.expires_at>now() AND m.status='active' LIMIT 1",[orgId,id,userId]);
   if(!reservation.rows[0])throw new ApiError(403,"Necesitas una asignación y un turno vigente.");
   const agent=await client.query("SELECT 1 FROM galeen_local_agents WHERE organization_id=$1 AND resource_id=$2 AND revoked_at IS NULL AND last_seen_at>now()-interval '3 minutes'",[orgId,id]);
   if(!agent.rows.length)throw new ApiError(409,"El agente local no está conectado.");
   const created=await client.query("INSERT INTO galeen_local_jobs(organization_id,resource_id,reservation_id,user_id,provider,model_id,prompt) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",[orgId,id,reservation.rows[0].id,userId,account.provider,model,prompt]);
   await audit(client,orgId,"local_broker.job_queued","local_job",created.rows[0].id,{resourceId:id},userId);
   return {ok:true,jobId:created.rows[0].id};
  }),201);
  if(body.action==="cancel")return respond(await withInstitution(req,org,institutionalRoles,async({client,orgId,userId})=>{
   const jobId=uuid(body.jobId);
   const updated=await client.query("UPDATE galeen_local_jobs SET state='canceled',run_id=NULL,lease_expires_at=NULL,updated_at=now(),finished_at=now() WHERE organization_id=$1 AND resource_id=$2 AND id=$3 AND user_id=$4 AND state IN ('queued','running') RETURNING id",[orgId,id,jobId,userId]);
   if(!updated.rows.length)throw new ApiError(404,"Trabajo no disponible.");
   await audit(client,orgId,"local_broker.job_canceled","local_job",jobId,{},userId);
   return {ok:true};
  }));
  throw new ApiError(400,"Acción no admitida.");
 }catch(e){return respondError(e);}
}

"use client";
import {useEffect,useState,type FormEvent} from "react";
type R=Record<string,any>;
type Kind="subscriptions"|"shared-accounts";
type Props={organizationId:string;role:string;kind:Kind};
const rolesManage=["owner","admin","manager"];
const rolesAdmin=["owner","admin"];
const value=(f:FormData,k:string)=>String(f.get(k)||"").trim();
export default function ResourceConsole({organizationId,role,kind}:Props){
 const [data,setData]=useState<R|null>(null),[error,setError]=useState(""),[ok,setOk]=useState(""),[busy,setBusy]=useState(false);
 const endpoint="/api/institution/"+kind;
 const canCreate=rolesAdmin.includes(role);
 const canAllocate=rolesManage.includes(role);
 async function refresh(){
  try{const r=await fetch(endpoint+"?organization="+encodeURIComponent(organizationId),{cache:"no-store"});const json=await r.json();if(!r.ok)throw Error(json.error||"No fue posible cargar");setData(json)}catch(e){setError(e instanceof Error?e.message:"Error")}
 }
 useEffect(()=>{setData(null);setError("");void refresh()},[organizationId,kind]);
 async function act(input:R){
  setBusy(true);setError("");setOk("");
  try{const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({organizationId,...input})});const json=await r.json();if(!r.ok)throw Error(json.error||"No se guardó");setOk("Cambios guardados.");await refresh()}
  catch(e){setError(e instanceof Error?e.message:"Error")}
  finally{setBusy(false)}
 }
 function submit(e:FormEvent<HTMLFormElement>,fn:(form:FormData)=>R){e.preventDefault();void act(fn(new FormData(e.currentTarget)))}
 const subs=kind==="subscriptions", list=(subs?data?.subscriptions:data?.resources)||[];
 return <div className="ip-resource-console">
  {error&&<div role="alert" className="ip-error">{error}</div>}{ok&&<div className="ip-ok">{ok}</div>}
  {canCreate&&<section className="ip-card"><h2>{subs?"Nueva suscripción":"Nueva cuenta compartida"}</h2>
   {subs?<form className="ip-form" onSubmit={e=>submit(e,f=>({action:"create",provider:value(f,"provider"),productName:value(f,"product"),label:value(f,"label"),seatCapacity:Number(value(f,"capacity")),accessMode:value(f,"access") }))}>
    <label>Proveedor<select name="provider">{["openai","anthropic","google","microsoft","other"].map(p=><option key={p}>{p}</option>)}</select></label>
    <label>Producto<input name="product" required minLength={2} placeholder="Servicio institucional"/></label>
    <label>Nombre interno<input name="label" required minLength={2}/></label><label>Licencias<input name="capacity" type="number" required min="1" defaultValue="10"/></label>
    <label>Acceso<select name="access"><option value="provider_managed">Administrado por el proveedor</option><option value="enterprise_sso">Inicio de sesión empresarial</option><option value="pending_integration">Integración pendiente</option></select></label>
    <button className="ip-primary" disabled={busy}>Registrar suscripción</button>
   </form>:<form className="ip-form" onSubmit={e=>submit(e,f=>({action:"create",provider:value(f,"provider"),label:value(f,"label"),accountAlias:value(f,"alias"),maxAssignees:Number(value(f,"max")),maxConcurrent:Number(value(f,"concurrent")),leaseMinutes:Number(value(f,"minutes"))}))}>
    <label>Proveedor<select name="provider">{["openai","anthropic","google","microsoft","other"].map(p=><option key={p}>{p}</option>)}</select></label>
    <label>Nombre<input name="label" required minLength={2}/></label>
    <label>Identificador<input name="alias" required minLength={2}/></label>
    <label>Usuarios autorizados<input name="max" type="number" min="1" defaultValue="5" required/></label>
    <label>Turnos simultáneos<input name="concurrent" type="number" min="1" defaultValue="1" required/></label>
    <label>Minutos por turno<input name="minutes" type="number" min="5" max="120" defaultValue="30" required/></label>
    <button className="ip-primary" disabled={busy}>Crear cuenta compartida</button>
   </form>}
  </section>}
  <section className="ip-card"><h2>{subs?"Suscripciones registradas":"Cuentas registradas"}</h2>
   {!list.length&&<p>Sin registros.</p>}
   {list.map((item:R)=><div className="ip-resource-item" key={item.id}>
    <div className="ip-row"><div className="ip-person"><b>{item.label}</b><small>{item.provider} · {item.status} · {subs?"Licencias: "+item.seats_used+"/"+item.seat_capacity:"Asignados: "+item.assignee_count+"/"+item.max_assignees}</small></div></div>
    {canCreate&&<form className="ip-form ip-inline-settings" onSubmit={e=>submit(e,f=>subs?({action:"update",subscriptionId:item.id,label:value(f,"label"),productName:value(f,"product"),seatCapacity:Number(value(f,"max")),status:value(f,"status"),accessMode:value(f,"access")}):({action:"update",resourceId:item.id,label:value(f,"label"),accountAlias:value(f,"alias"),maxAssignees:Number(value(f,"max")),maxConcurrent:Number(value(f,"concurrent")),leaseMinutes:Number(value(f,"minutes")),status:value(f,"status")}))}>
      <label>Nombre<input name="label" required defaultValue={item.label}/></label>
      {subs?<><label>Producto<input name="product" defaultValue={item.product_name} required/></label><label>Licencias<input name="max" type="number" min="1" defaultValue={item.seat_capacity} required/></label>
      <label>Acceso<select name="access" defaultValue={item.access_mode}><option value="provider_managed">Proveedor</option><option value="enterprise_sso">SSO empresarial</option><option value="pending_integration">Pendiente</option></select></label></>:
      <><label>Identificador<input name="alias" defaultValue={item.account_alias} required/></label><label>Usuarios<input name="max" type="number" min="1" defaultValue={item.max_assignees} required/></label>
      <label>Concurrencia<input name="concurrent" type="number" min="1" defaultValue={item.max_concurrent} required/></label><label>Minutos<input name="minutes" type="number" min="5" max="120" defaultValue={item.lease_minutes} required/></label></>}
      <label>Estado<select name="status" defaultValue={item.status}><option value="active">Activo</option><option value="paused">Pausado</option><option value="retired">Retirado</option></select></label>
      <button className="ip-primary" disabled={busy}>Guardar</button></form>}
    {canAllocate&&<form className="ip-assignment" onSubmit={e=>submit(e,f=>subs?({action:"assign",subscriptionId:item.id,userId:value(f,"user")}):({action:"assign",resourceId:item.id,userId:value(f,"user")}))}>
      <select name="user" required><option value="">Selecciona un usuario</option>{(data?.users||[]).map((u:R)=><option key={u.user_id} value={u.user_id}>{u.email}</option>)}</select><button disabled={busy}>Asignar {subs?"licencia":"acceso"}</button>
    </form>}
    {(subs?data?.allocations:data?.assigned)?.filter((a:R)=>(subs?a.subscription_id:a.resource_id)===item.id).map((a:R)=><div className="ip-row" key={a.id}><div className="ip-person"><b>{a.display_name||a.email}</b><small>{a.email}</small></div>
     {canAllocate&&<button disabled={busy} onClick={()=>void act(subs?{action:"revoke",subscriptionId:item.id,allocationId:a.id}:{action:"revoke",resourceId:item.id,userId:a.user_id})}>Revocar</button>}</div>)}
    {!subs&&<><div className="ip-row"><small>Turnos ocupados: {item.busy_count}/{item.max_concurrent}</small><button disabled={busy||item.status!=="active"} onClick={()=>void act({action:"reserve",resourceId:item.id})}>Reservar turno</button></div>
     {data?.reservations?.filter((r:R)=>r.resource_id===item.id&&(canAllocate||r.user_id===data.userId)).map((r:R)=><div className="ip-row" key={r.id}><small>Turno hasta {new Date(r.expires_at).toLocaleTimeString("es-MX")}</small><button disabled={busy} onClick={()=>void act({action:"release",resourceId:item.id,reservationId:r.id})}>Liberar</button></div>)}</>}
   </div>)}
  </section>
 </div>;
}

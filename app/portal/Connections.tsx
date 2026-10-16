"use client";
import {useState,type FormEvent} from "react";
type R=Record<string,any>;
export default function Connections({organizationId,role,items,onRefresh}:{organizationId:string;role:string;items:R[];onRefresh:()=>Promise<void>}){
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const allowed=["owner","admin"].includes(role);
 const field=(f:FormData,k:string)=>String(f.get(k)||"").trim();
 async function act(data:R){setBusy(true);setError("");setNotice("");try{
  const res=await fetch("/api/institution/connections",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...data,organizationId})});
  const json=await res.json();if(!res.ok)throw Error(json.error||"No se pudo guardar.");
  setNotice(json.health?"Estado: "+json.health:"Cambios guardados.");await onRefresh();
 }catch(e){setError(e instanceof Error?e.message:"Error");}finally{setBusy(false)}}
 function submit(e:FormEvent<HTMLFormElement>,make:(form:FormData)=>R){e.preventDefault();void act(make(new FormData(e.currentTarget)))}
 return <div>
  {error&&<div className="ip-error" role="alert">{error}</div>}{notice&&<div className="ip-ok">{notice}</div>}
  {allowed&&<section className="ip-card"><h2>Nueva conexión</h2><form className="ip-form" onSubmit={e=>submit(e,f=>({action:"create",provider:field(f,"provider"),label:field(f,"label"),credential:field(f,"credential")}))}>
    <label>Proveedor<select name="provider">{["openai","anthropic","google","openrouter"].map(p=><option key={p}>{p}</option>)}</select></label>
    <label>Nombre de conexión<input name="label" minLength={2} required/></label>
    <label>Credencial de API<input name="credential" type="password" required autoComplete="off"/></label>
    <button className="ip-primary" disabled={busy}>Guardar conexión</button>
  </form></section>}
  <section className="ip-card"><h2>Conexiones registradas</h2>{!items.length&&<p>Sin conexiones.</p>}
    {items.map(item=><div key={item.id} className="ip-resource-item">
      <div className="ip-row"><div className="ip-person"><b>{item.label}</b><small>{item.provider} · {item.health_status||"Sin probar"} · {item.enabled?"Activa":"Inactiva"}</small></div>
      {allowed&&<><button disabled={busy} onClick={()=>void act({action:"test",connectionId:item.id})}>Probar</button>
      <button disabled={busy} onClick={()=>void act({action:"toggle",connectionId:item.id,enabled:!item.enabled})}>{item.enabled?"Desactivar":"Activar"}</button>
      <button disabled={busy} onClick={()=>{if(window.confirm("¿Eliminar la conexión?"))void act({action:"remove",connectionId:item.id})}}>Eliminar</button></>}</div>
      {allowed&&<form className="ip-assignment" onSubmit={e=>submit(e,f=>({action:"rename",connectionId:item.id,label:field(f,"name")}))}>
        <input name="name" defaultValue={item.label} minLength={2} required/><button disabled={busy}>Renombrar</button></form>}
      {allowed&&<form className="ip-assignment" onSubmit={e=>submit(e,f=>({action:"rotate",connectionId:item.id,credential:field(f,"credential")}))}>
        <input name="credential" type="password" required autoComplete="off" placeholder="Nueva credencial"/><button disabled={busy}>Cambiar credencial</button></form>}
    </div>)}
  </section>
 </div>;
}

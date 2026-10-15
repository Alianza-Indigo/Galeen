"use client";
import {useState,type FormEvent} from "react";
import "./connections.css";
type C={id:string;label:string;provider:string;enabled:boolean;health_status:string;credential_hint?:string;last_checked_at?:string};
type P={organizationId:string;allowedProviders:string[];connections:C[];canManage:boolean;onSaved:()=>Promise<void>};
const names:Record<string,string>={openai:"OpenAI",anthropic:"Anthropic",google:"Google Gemini",openrouter:"OpenRouter"};
const statuses:Record<string,string>={untested:"Sin verificar",healthy:"Verificada",invalid:"Clave inválida",limited:"Límite alcanzado",unavailable:"No disponible"};
export default function ConnectionsManager({organizationId,allowedProviders,connections,canManage,onSaved}:P){
 const [provider,setProvider]=useState("openai"),[label,setLabel]=useState(""),[key,setKey]=useState("");
 const [editing,setEditing]=useState(""),[value,setValue]=useState(""),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 async function submit(action:string,id?:string,fields:Record<string,unknown>={}){
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/institution/connections",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({organizationId,action,connectionId:id,...fields})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"No fue posible guardar.");
   setMessage(action==="test"?(statuses[result.health]||"Verificación realizada"):"Cambios guardados.");
   setEditing("");setValue("");setKey("");
   if(action==="create")setLabel("");
   await onSaved();
  }catch(e){setMessage(e instanceof Error?e.message:"Error de conexión");}
  finally{setBusy(false);}
 }
 const options=["openai","anthropic","google","openrouter"].filter(p=>allowedProviders.includes(p));
 function create(e:FormEvent<HTMLFormElement>){e.preventDefault();void submit("create",undefined,{provider:options.includes(provider)?provider:options[0],label,credential:key});}
 return <>
  <section className="ip-card"><h2>Conexiones ({connections.length})</h2>
  {message&&<p className="ip-provider-alert" role="status">{message}</p>}
  {connections.length===0&&<div className="ip-empty">No hay conexiones registradas.</div>}
  {connections.map(c=><div className="ip-provider-item" key={c.id}>
   <div><b>{c.label}</b><small>{names[c.provider]||c.provider} · {statuses[c.health_status]||"Sin verificar"} · {c.enabled?"Activa":"Desactivada"}</small>
    {c.credential_hint&&<small>Clave: {c.credential_hint}</small>}</div>
   {canManage&&<div className="ip-provider-buttons">
    <button disabled={busy} onClick={()=>void submit("test",c.id)}>Probar</button>
    <button disabled={busy||(!c.enabled&&c.health_status!=="healthy")} onClick={()=>void submit("toggle",c.id,{enabled:!c.enabled})}>{c.enabled?"Desactivar":"Activar"}</button>
    <button disabled={busy} onClick={()=>{setEditing("rename:"+c.id);setValue(c.label)}}>Renombrar</button>
    <button disabled={busy} onClick={()=>{setEditing("rotate:"+c.id);setValue("")}}>Cambiar clave</button>
    <button disabled={busy} className="ip-provider-danger" onClick={()=>{if(confirm("¿Eliminar esta conexión?"))void submit("remove",c.id)}}>Eliminar</button>
   </div>}
   {canManage&&editing.endsWith(":"+c.id)&&<form className="ip-provider-edit" onSubmit={e=>{e.preventDefault();void submit(editing.startsWith("rename:")?"rename":"rotate",c.id,editing.startsWith("rename:")?{label:value}:{credential:value})}}>
    <label>{editing.startsWith("rename:")?"Nombre":"Nueva clave API"}
     <input type={editing.startsWith("rename:")?"text":"password"} minLength={editing.startsWith("rename:")?2:12} maxLength={editing.startsWith("rename:")?100:4096} autoComplete="off" value={value} onChange={e=>setValue(e.target.value)} required/></label>
    <button type="submit" disabled={busy}>Guardar</button><button type="button" onClick={()=>{setEditing("");setValue("")}}>Cancelar</button>
   </form>}
  </div>)}</section>
  {canManage&&<section className="ip-card"><h2>Agregar proveedor</h2>
    <form className="ip-provider-grid" onSubmit={create}>
     <label>Proveedor<select value={options.includes(provider)?provider:(options[0]||"")} onChange={e=>setProvider(e.target.value)}>{options.map(p=><option key={p} value={p}>{names[p]}</option>)}</select></label>
     <label>Nombre<input required minLength={2} maxLength={100} value={label} onChange={e=>setLabel(e.target.value)}/></label>
     <label className="wide">Clave API institucional<input required type="password" autoComplete="off" minLength={12} maxLength={4096} value={key} onChange={e=>setKey(e.target.value)}/></label>
     <button className="ip-primary" disabled={busy||options.length===0}>Guardar conexión</button>
    </form>
  </section>}
 </>;
}

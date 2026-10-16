"use client";
import {useEffect,useState} from "react";
type Job={id:string;state:string;result:string|null;error:string|null;created_at:string};
export default function LocalBrokerPanel({organizationId,resourceId,canManage,hasTurn,provider}:{organizationId:string;resourceId:string;canManage:boolean;hasTurn:boolean;provider:string}){
 const [state,setState]=useState<{enabled:boolean;agent?:{agent_name:string;last_seen_at:string|null;revoked_at:string|null}|null;jobs?:Job[]}>({enabled:false});
 const [notice,setNotice]=useState("");const [pair,setPair]=useState("");const [prompt,setPrompt]=useState("");const [busy,setBusy]=useState(false);
 const url="/api/institution/local-broker";
 async function reload(){try{const r=await fetch(url+"?organizationId="+organizationId+"&resourceId="+resourceId,{cache:"no-store"});const d=await r.json();if(r.ok)setState(d);else setNotice(d.error||"Error de conexión");}catch{setNotice("No fue posible cargar el motor local.");}}
 useEffect(()=>{void reload();const timer=setInterval(()=>void reload(),10000);return ()=>clearInterval(timer)},[organizationId,resourceId]);
 async function action(name:string,extra:Record<string,unknown>={}){setBusy(true);setNotice("");try{const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:name,organizationId,resourceId,...extra})});const d=await r.json();if(!r.ok)throw Error(d.error||"No se pudo completar.");if(name==="pair")setPair(d.code);else if(name==="submit")setPrompt("");else if(name==="disconnect")setPair("");await reload();}catch(e){setNotice(e instanceof Error?e.message:"Error");}finally{setBusy(false)}}
 if(!["openai","anthropic"].includes(provider)||!state.enabled)return null;
 const connected=Boolean(state.agent&&!state.agent.revoked_at&&state.agent.last_seen_at&&Date.now()-new Date(state.agent.last_seen_at).getTime()<180000);
 return <section className="sa-engine" aria-label="Motor local GALEEN">
  <div className="sa-engine-header"><div><b>Agente local GALEEN</b><small>{connected?"En línea":state.agent&&!state.agent.revoked_at?"Sin actividad reciente":"Sin vincular"} · 1 a 50 ejecuciones simultáneas según el recurso</small></div></div>
  {canManage&&<div className="sa-engine-tools"><button disabled={busy} onClick={()=>void action("pair")}>Generar código de vinculación</button><button disabled={busy||!state.agent} onClick={()=>void action("disconnect")}>Revocar agente</button></div>}
  {canManage&&pair&&<p>Introduce este código en el equipo del titular (vence en 10 minutos): <code style={{overflowWrap:"anywhere"}}>{pair}</code></p>}
  {hasTurn&&<form className="sa-engine-chat" onSubmit={e=>{e.preventDefault();if(prompt.trim())void action("submit",{prompt:prompt.trim()})}}><label>Solicitar ejecución local<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={12000} rows={3} required/></label><button disabled={busy||!connected||!prompt.trim()}>Enviar al agente</button></form>}
  {(state.jobs||[]).map(j=><div className="sa-engine-output" key={j.id}><small>{j.state} · {new Date(j.created_at).toLocaleString("es-MX")}</small>{j.result&&<p style={{whiteSpace:"pre-wrap"}}>{j.result}</p>}{j.error&&<p>{j.error}</p>}{["queued","running"].includes(j.state)&&<button disabled={busy} onClick={()=>void action("cancel",{jobId:j.id})}>Cancelar</button>}</div>)}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}

"use client";
import { useState, type FormEvent } from "react";
type Props={
 organizationId:string;resourceId:string;provider:string;
 model?:string|null;hint?:string|null;status:string;
 canManage:boolean;hasTurn:boolean;onChange:()=>Promise<void>
};
export default function PoolBrokerPanel({organizationId,resourceId,provider,model,hint,status,canManage,hasTurn,onChange}:Props){
 const [expanded,setExpanded]=useState(false),[key,setKey]=useState("");
 const [chosenModel,setChosenModel]=useState(model||(
   provider==="anthropic"?"claude-sonnet-4-5":"gpt-5.2"));
 const [prompt,setPrompt]=useState(""),[output,setOutput]=useState("");
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const supported=provider==="openai"||provider==="anthropic";
 async function act(action:"save"|"test"|"disconnect"|"infer",extra:Record<string,unknown>={}){
  setBusy(true);setNotice("");
  try{
   const res=await fetch("/api/institution/shared-broker",{
    method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({organizationId,resourceId,action,...extra})
   });
   const val=await res.json();
   if(!res.ok)throw Error(val.error||"No fue posible completar la operación.");
   if(action==="infer")setOutput(val.text||"");
   else{
    setNotice(action==="test"?"Conexión verificada.":"Cambios guardados.");
    if(action==="save")setKey("");
    await onChange();
   }
  }catch(e){setNotice(e instanceof Error?e.message:"Error de conexión");}
  finally{setBusy(false)}
 }
 if(!supported)return <p className="sa-engine-line">No hay adaptador ElizaOS para este proveedor.</p>;
 return <div className="sa-engine">
  <div className="sa-engine-header">
   <div><b>Motor ElizaOS</b><small>{status==="connected"?"Conectado":status==="invalid"?"Credencial inválida":
    status==="pending_authorized_connector"?"Pendiente de prueba":"Sin conexión"}{hint?" · "+hint:""}</small></div>
   {canManage&&<button onClick={()=>setExpanded(!expanded)}>{expanded?"Cerrar":"Configurar"}</button>}
  </div>
  {canManage&&expanded&&<>
   <form className="sa-engine-form" onSubmit={e=>{e.preventDefault();void act("save",{poolKey:key,model:chosenModel})}}>
    <label>Clave de acceso del pool<input required type="password" minLength={12}
      maxLength={4000} autoComplete="off" value={key} onChange={e=>setKey(e.target.value)}/></label>
    <label>Modelo<input required maxLength={100} value={chosenModel}
      onChange={e=>setChosenModel(e.target.value)}/></label>
    <button disabled={busy}>Guardar conexión</button>
   </form>
   <div className="sa-engine-tools">
    <button disabled={busy||!hint} onClick={()=>void act("test")}>Probar motor</button>
    <button disabled={busy||!hint} onClick={()=>{
     if(window.confirm("¿Desconectar este recurso del motor?"))void act("disconnect");
    }}>Desconectar</button>
   </div>
  </>}
  {hasTurn&&hint&&<form className="sa-engine-chat"
   onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(prompt.trim())void act("infer",{prompt:prompt.trim()})}}>
    <label>Mensaje<textarea value={prompt} onChange={e=>setPrompt(e.target.value)}
      maxLength={12000} rows={3} required placeholder="Escribe tu mensaje..."/></label>
    <button disabled={busy||!prompt.trim()}>Enviar</button>
    {output&&<div className="sa-engine-output">{output}</div>}
   </form>}
  {notice&&<p className="sa-engine-message" role="status">{notice}</p>}
 </div>;
}

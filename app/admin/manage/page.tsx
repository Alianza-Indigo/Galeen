"use client";
import {useEffect,useState,type FormEvent} from "react";
import "./admin.css";
type R=Record<string,any>;
const roles=["owner","admin","manager","member","auditor"];
const providers=["openai","anthropic","google","openrouter","custom"];
export default function Manage(){
 const [items,setItems]=useState<R[]>([]),[details,setDetails]=useState<R>({}),[selected,setSelected]=useState(""),[tab,setTab]=useState("general");
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[invite,setInvite]=useState("");
 const org=items.find(x=>x.id===selected);
 async function load(id=selected){
   try{const res=await fetch("/api/admin/data"+(id?"?organization="+id:""),{cache:"no-store"});
   const json=await res.json();if(!res.ok)throw Error(json.error||"Error de lectura");
   setItems(json.organizations||[]);setDetails(json);
   }catch(e){setError(String(e instanceof Error?e.message:e))}
 }
 useEffect(()=>{void load()},[selected]);
 async function act(payload:R){
   setBusy(true);setError("");setNotice("");
   try{const res=await fetch("/api/admin/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
   const json=await res.json();if(!res.ok)throw Error(json.error||"No se guardó");
   if(json.organization){setSelected(json.organization.id);setTab("general")}
   if(json.invitationPath)setInvite(window.location.origin+json.invitationPath);
   setNotice("Cambios guardados");await load(json.organization?.id||selected);
   }catch(e){setError(String(e instanceof Error?e.message:e))}
   finally{setBusy(false)}
 }
 const submit=(e:FormEvent<HTMLFormElement>,make:(f:FormData)=>R)=>{e.preventDefault();void act(make(new FormData(e.currentTarget)))};
 const val=(f:FormData,k:string)=>String(f.get(k)||"").trim();
 const n=(x:any)=>Number(x||0);
 return <main className="mg">
  <header><div><a href="/admin">← GALEEN</a><p className="eyebrow">SUPERADMIN</p><h1>Administración institucional</h1></div><button onClick={()=>load()}>Actualizar</button></header>
  {error&&<div className="alert bad" role="alert">{error}</div>}{notice&&<div className="alert good">{notice}</div>}
  <div className="columns"><aside><h2>Instituciones ({items.length})</h2>{items.map(o=><button key={o.id} className={selected===o.id?"active":""} onClick={()=>{setSelected(o.id);setTab("general");setInvite("")}}><b>{o.name}</b><small>{o.slug} · {o.status}</small></button>)}
    <button className="primary" onClick={()=>{setSelected("");setTab("general")}}>+ Nueva institución</button></aside>
   <article>{!org?<section><h2>Registrar institución</h2><form onSubmit={e=>submit(e,f=>({action:"create_organization",name:val(f,"name"),slug:val(f,"slug")}))}>
     <label>Nombre<input name="name" minLength={2} maxLength={180} required/></label><label>Identificador<input name="slug" pattern="[a-z0-9][a-z0-9-]+" required placeholder="colegio-norte"/></label><button className="primary" disabled={busy}>Crear</button></form></section>:
    <><div className="orgheader"><h2>{org.name}</h2><span>{org.status}</span></div><nav className="tabs">{[["general","General"],["users","Usuarios"],["plans","Planes"],["branding","Marca blanca"],["quotas","Cuotas"],["audit","Auditoría"]].map(([k,v])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{v}</button>)}</nav>
    {tab==="general"&&<section><h2>Institución</h2><form key={org.id} onSubmit={e=>submit(e,f=>({action:"update_organization",organizationId:selected,name:val(f,"name"),slug:val(f,"slug"),status:val(f,"status")}))}>
      <label>Nombre<input name="name" defaultValue={org.name} required/></label><label>Identificador<input name="slug" defaultValue={org.slug} required/></label><label>Estado<select name="status" defaultValue={org.status}><option value="active">Activa</option><option value="suspended">Suspendida</option><option value="closed">Cerrada</option></select></label><button className="primary" disabled={busy}>Guardar</button></form></section>}
    {tab==="users"&&<><section><h2>Miembros</h2>{(details.members||[]).length===0?<p>Sin miembros.</p>:(details.members||[]).map((m:R)=><form key={m.user_id} className="horizontal" onSubmit={e=>submit(e,f=>({action:"update_member",organizationId:selected,userId:m.user_id,role:val(f,"role"),status:val(f,"status")}))}>
      <span><b>{m.display_name||m.email}</b><small>{m.email}</small></span><select name="role" defaultValue={m.role}>{roles.map(r=><option key={r}>{r}</option>)}</select><select name="status" defaultValue={m.status}>{["active","suspended","revoked"].map(r=><option key={r}>{r}</option>)}</select><button disabled={busy}>Guardar</button></form>)}</section>
     <section><h2>Invitar usuario</h2><form onSubmit={e=>submit(e,f=>({action:"invite_member",organizationId:selected,email:val(f,"email"),role:val(f,"role"),days:n(val(f,"days"))}))}>
       <label>Correo<input name="email" type="email" required/></label><label>Rol<select name="role">{roles.map(r=><option key={r}>{r}</option>)}</select></label><label>Vigencia en días<input name="days" type="number" min="1" max="30" defaultValue="7"/></label><button className="primary" disabled={busy||org.status!=="active"}>Generar enlace</button></form>
       {invite&&<div className="invite"><code>{invite}</code><button onClick={()=>navigator.clipboard.writeText(invite)}>Copiar invitación</button></div>}
     </section><section><h2>Invitaciones</h2>{(details.invitations||[]).filter((i:R)=>!i.revoked_at&&!i.accepted_at&&new Date(i.expires_at)>new Date()).map((i:R)=><div className="horizontal" key={i.id}><span>{i.email} · {i.role}</span><button disabled={busy} onClick={()=>act({action:"revoke_invitation",organizationId:selected,invitationId:i.id})}>Revocar</button></div>)}</section></>}
    {tab==="plans"&&<section><h2>Plan y capacidad</h2><form key={org.id} onSubmit={e=>submit(e,f=>({action:"update_entitlements",organizationId:selected,entitlements:{
     planCode:val(f,"plan"),maxUsers:n(val(f,"users")),maxMonthlyRequests:n(val(f,"requests")),
     maxMonthlyMicroUsd:Math.round(n(val(f,"usd"))*1000000),allowedProviders:providers.filter(p=>f.get(p)==="on"),customDomainEnabled:f.get("custom")==="on"
    }}))}><label>Plan<input name="plan" defaultValue={org.plan_code||"standard"} required/></label><label>Máximo usuarios<input type="number" name="users" defaultValue={org.max_users||50} min="1" required/></label><label>Solicitudes mensuales<input name="requests" type="number" min="0" defaultValue={n(org.max_monthly_requests)} required/></label>
      <label>Presupuesto mensual USD<input name="usd" type="number" step=".01" min="0" defaultValue={n(org.max_monthly_micro_usd)/1000000} required/></label><fieldset><legend>Proveedores permitidos</legend>{providers.map(p=><label className="check" key={p}><input type="checkbox" name={p} defaultChecked={(org.allowed_providers||[]).includes(p)}/>{p}</label>)}</fieldset><label className="check"><input type="checkbox" name="custom" defaultChecked={org.custom_domain_enabled}/>Dominio personalizado</label><button className="primary" disabled={busy}>Guardar plan</button></form></section>}
    {tab==="branding"&&<section><h2>Marca blanca</h2><form key={org.id} onSubmit={e=>submit(e,f=>({action:"update_branding",organizationId:selected,branding:{shortName:val(f,"name"),primaryColor:val(f,"color"),logoUrl:val(f,"logo")}}))}>
       <label>Nombre corto<input name="name" defaultValue={org.branding?.shortName||org.name}/></label><label>Color<input name="color" type="color" defaultValue={org.branding?.primaryColor||"#172b44"}/></label><label>URL del logotipo<input name="logo" type="url" defaultValue={org.branding?.logoUrl||""}/></label><button className="primary" disabled={busy}>Guardar marca</button></form></section>}
    {tab==="quotas"&&<><section><h2>Crear política</h2><form onSubmit={e=>submit(e,f=>({action:"update_usage_policy",organizationId:selected,period:val(f,"period"),maxRequests:n(val(f,"requests")),maxMicroUsd:Math.round(n(val(f,"usd"))*1000000),maxTokens:n(val(f,"tokens")),userId:val(f,"user")||null}))}>
       <label>Periodo<select name="period">{["daily","weekly","monthly"].map(p=><option key={p}>{p}</option>)}</select></label><label>Usuario<select name="user"><option value="">Toda la institución</option>{(details.members||[]).filter((m:R)=>m.status==="active").map((m:R)=><option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>
       <label>Solicitudes<input name="requests" type="number" defaultValue="1000" min="1"/></label><label>Presupuesto USD<input name="usd" type="number" step=".01" min=".01" defaultValue="100"/></label><label>Tokens<input name="tokens" type="number" min="1" defaultValue="1000000"/></label><button className="primary" disabled={busy}>Crear política</button></form></section>
       <section><h2>Políticas registradas</h2>{(details.policies||[]).map((p:R)=><div key={p.id} className="horizontal"><span>{p.period} · {p.max_requests} solicitudes · {p.user_id?"Individual":"Institucional"}</span><button disabled={busy} onClick={()=>act({action:"delete_usage_policy",organizationId:selected,policyId:p.id})}>Eliminar</button></div>)}</section></>}
    {tab==="audit"&&<section><h2>Auditoría</h2>{(details.events||[]).map((e:R)=><div key={e.id} className="horizontal"><span>{new Date(e.created_at).toLocaleString("es-MX")}</span><b>{e.action}</b><small>{e.entity_type}</small></div>)}</section>}
    </>}
    </article></div>
 </main>;
}

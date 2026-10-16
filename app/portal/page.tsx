"use client";
import {useEffect,useState,type FormEvent} from "react";
import "./portal.css";
type R=Record<string,any>;
const names:Record<string,string>={owner:"Propietario",admin:"Administrador",manager:"Gestor",member:"Miembro",auditor:"Auditor"};
const management=["owner","admin","manager"];
export default function Portal(){
 const [profile,setProfile]=useState<R|null>(null),[id,setId]=useState(""),[data,setData]=useState<R|null>(null),[tab,setTab]=useState("overview");
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(false),[invite,setInvite]=useState("");
 useEffect(()=>{fetch("/api/member/me",{cache:"no-store"}).then(async r=>{if(r.status===401){location.assign("/member/login");return null}const j=await r.json();if(!r.ok)throw Error(j.error);return j}).then(j=>{if(j){setProfile(j);setId(j.institutions[0]?.id||"")}}).catch(e=>setError(e.message))},[]);
 async function reload(org=id){
  if(!org)return;setLoading(true);
  try{const r=await fetch("/api/institution/data?organization="+encodeURIComponent(org),{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error);setData(j)}catch(e){setError(e instanceof Error?e.message:"No se pudo cargar");setData(null)}finally{setLoading(false)}
 }
 useEffect(()=>{setData(null);setTab("overview");setInvite("");void reload(id)},[id]);
 async function act(payload:R){setLoading(true);setError("");setNotice("");try{const r=await fetch("/api/institution/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,organizationId:id})});const j=await r.json();if(!r.ok)throw Error(j.error);if(j.invitationPath)setInvite(location.origin+j.invitationPath);setNotice("Cambios guardados.");await reload(id)}catch(e){setError(e instanceof Error?e.message:"No se guardó")}finally{setLoading(false)}}
 function submit(e:FormEvent<HTMLFormElement>,fn:(f:FormData)=>R){e.preventDefault();void act(fn(new FormData(e.currentTarget)))}
 const str=(f:FormData,key:string)=>String(f.get(key)||"").trim();
 async function logout(){await fetch("/api/member/logout",{method:"POST"});location.assign("/")}
 const org=data?.organization,role=String(data?.role||"");
 const manage=management.includes(role),brand=["owner","admin"].includes(role),audit=brand||role==="auditor";
 const tabs=[["overview","Resumen"],...(manage?[["members","Usuarios"],["quotas","Cuotas"]]:[]),...(brand?[["brand","Identidad"]]:[]),...(audit?[["audit","Auditoría"]]:[]),["connections","Conexiones"]];
 const roleList=role==="manager"?["member","auditor"]:role==="admin"?["admin","manager","member","auditor"]:["admin","manager","member","auditor"];
 return <div className="ip-shell">
  <aside className="ip-side"><a href="/" className="ip-logo">galeen.</a><div className="ip-work"><b>{org?.branding?.shortName||org?.name||"Mi institución"}</b><small>{names[role]||"Acceso institucional"}</small></div>
  <nav>{tabs.map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}</button>)}</nav>
  <div className="ip-bottom"><small>{profile?.user?.email}</small><button onClick={logout}>Salir ↗</button></div></aside>
  <main className="ip-main"><header className="ip-bar"><strong>GALEEN / {org?.name||"Institución"}</strong><div>
   {profile?.institutions?.length>1&&<select value={id} onChange={e=>setId(e.target.value)} aria-label="Institución">{(profile?.institutions||[]).map((x:R)=><option key={x.id} value={x.id}>{x.name}</option>)}</select>}
   <button onClick={()=>void reload()} disabled={loading}>Actualizar</button></div></header>
   <div className="ip-content"><small className="ip-over">PANEL INSTITUCIONAL</small><h1>{tabs.find(([k])=>k===tab)?.[1]}</h1>
    {error&&<div className="ip-error" role="alert">{error}</div>}{notice&&<div className="ip-ok">{notice}</div>}
    {profile&&!id&&<section className="ip-card"><h2>Sin institución asignada</h2></section>}
    {id&&!data&&!error&&<p>Cargando...</p>}
    {org&&tab==="overview"&&<><div className="ip-kpis">{[["Usuarios",data.statistics?.members],["Solicitudes",data.statistics?.requests],["Conexiones",data.statistics?.connections],["Plan",org.plan_code]].map(([k,v])=><article key={String(k)}><small>{k}</small><strong>{v}</strong></article>)}</div>
     <section className="ip-card"><h2>{org.name}</h2><p>Rol: {names[role]} · Usuarios permitidos: {org.max_users}</p><p>Proveedores: {org.allowed_providers?.join(", ")||"Ninguno"}</p></section>
     {manage&&<div className="ip-actions"><button onClick={()=>setTab("members")}>Administrar usuarios →</button><button onClick={()=>setTab("quotas")}>Administrar cuotas →</button>{brand&&<button onClick={()=>setTab("brand")}>Personalizar →</button>}</div>}</>}
    {org&&tab==="members"&&manage&&<><section className="ip-card"><h2>Usuarios</h2>{data.members?.map((m:R)=><form className="ip-row" key={m.user_id} onSubmit={e=>submit(e,f=>({action:"update_member",userId:m.user_id,role:str(f,"role"),status:str(f,"status")}))}>
      <div className="ip-person"><b>{m.display_name||m.email}</b><small>{m.email}</small></div>
      {m.user_id===data.userId||m.role==="owner"||role==="admin"&&m.role==="admin"||role==="manager"&&!["member","auditor"].includes(m.role)
       ?<span>{names[m.role]} · {m.status}</span>:<><select name="role" defaultValue={m.role}>{roleList.map(r=><option key={r} value={r}>{names[r]}</option>)}</select><select name="status" defaultValue={m.status}><option value="active">Activo</option><option value="suspended">Suspendido</option><option value="revoked">Revocado</option></select><button disabled={loading}>Guardar</button></>}
      </form>)}</section>
      <section className="ip-card"><h2>Invitar usuario</h2><form className="ip-form" onSubmit={e=>submit(e,f=>({action:"invite",email:str(f,"email"),role:str(f,"role"),days:Number(str(f,"days"))}))}>
       <label>Correo<input name="email" type="email" required/></label><label>Rol<select name="role">{roleList.map(r=><option key={r} value={r}>{names[r]}</option>)}</select></label><label>Vigencia (días)<input name="days" type="number" defaultValue="7" min="1" max="30" required/></label>
       <button className="ip-primary" disabled={loading}>Generar invitación</button></form>
       {invite&&<div className="ip-invite"><code>{invite}</code><button onClick={()=>navigator.clipboard.writeText(invite)}>Copiar enlace</button></div>}</section>
       <section className="ip-card"><h2>Invitaciones pendientes</h2>{data.invitations?.filter((x:R)=>!x.accepted_at&&!x.revoked_at&&new Date(x.expires_at)>new Date()).map((x:R)=><div className="ip-row" key={x.id}><div className="ip-person"><b>{x.email}</b><small>{names[x.role]}</small></div><button disabled={loading} onClick={()=>void act({action:"revoke_invite",invitationId:x.id})}>Revocar</button></div>)}</section>
      </>}
    {org&&tab==="quotas"&&manage&&<><section className="ip-card"><h2>Crear cuota</h2><form className="ip-form" onSubmit={e=>submit(e,f=>({action:"create_policy",period:str(f,"period"),userId:str(f,"user")||null,maxRequests:Number(str(f,"requests")),maxTokens:Number(str(f,"tokens")),maxMicroUsd:Math.round(Number(str(f,"budget"))*1e6)}))}>
      <label>Periodo<select name="period"><option value="daily">Diario</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select></label>
      <label>Usuario<select name="user"><option value="">Institución</option>{data.members?.filter((m:R)=>m.status==="active").map((m:R)=><option value={m.user_id} key={m.user_id}>{m.email}</option>)}</select></label>
      <label>Solicitudes<input type="number" name="requests" required min="1" defaultValue="100"/></label><label>Presupuesto (USD)<input type="number" name="budget" required min=".01" step=".01" defaultValue="10"/></label>
      <label>Tokens<input type="number" name="tokens" required min="1" defaultValue="100000"/></label><button className="ip-primary" disabled={loading}>Guardar cuota</button></form></section>
      <section className="ip-card"><h2>Cuotas existentes</h2>{data.policies?.map((p:R)=><div className="ip-row" key={p.id}><div className="ip-person"><b>{p.period} · {p.user_id?"Personal":"Institucional"}</b><small>{p.max_requests} solicitudes</small></div><button disabled={loading} onClick={()=>void act({action:"delete_policy",policyId:p.id})}>Eliminar</button></div>)}</section></>}
    {org&&tab==="brand"&&brand&&<section className="ip-card"><h2>Identidad visual</h2><form className="ip-form" key={org.id} onSubmit={e=>submit(e,f=>({action:"branding",branding:{shortName:str(f,"name"),primaryColor:str(f,"color"),logoUrl:str(f,"logo")}}))}>
      <label>Nombre corto<input name="name" defaultValue={org.branding?.shortName||org.name} required/></label><label>Color<input type="color" name="color" defaultValue={org.branding?.primaryColor||"#172b44"}/></label>
      <label>Logotipo (URL HTTPS)<input type="url" name="logo" defaultValue={org.branding?.logoUrl||""}/></label><button className="ip-primary" disabled={loading}>Guardar identidad</button></form></section>}
    {org&&tab==="audit"&&audit&&<section className="ip-card"><h2>Actividad</h2>{data.audit?.map((a:R,i:number)=><div className="ip-row" key={i}><div className="ip-person"><b>{a.action}</b><small>{a.entity_type}</small></div><small>{new Date(a.created_at).toLocaleString("es-MX")}</small></div>)}</section>}
    {org&&tab==="connections"&&<Connections organizationId={id} role={role} items={data.connections||[]} onRefresh={()=>reload(id)}/>}
   </div>
  </main>
 </div>;
}

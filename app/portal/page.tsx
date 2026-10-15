"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import ConnectionsManager from "./ConnectionsManager";
import SubscriptionsManager from "./SubscriptionsManager";
import "./institution.css";

type Institution={
 id:string;name:string;slug:string;status:string;role:string;branding?:{shortName?:string;primaryColor?:string;logoUrl?:string};
 plan_code:string;max_users:number;max_monthly_requests:string;max_monthly_micro_usd:string;allowed_providers:string[];
};
type Person={id:string;email:string;display_name:string|null};
type Membership={user_id:string;email:string;display_name:string|null;role:string;status:string};
type Invitation={id:string;email:string;role:string;created_at:string;expires_at:string;revoked_at:string|null;accepted_at:string|null};
type Policy={id:string;period:string;user_id:string|null;max_requests:string;max_effective_tokens:string;max_micro_usd:string};
type Connection={id:string;provider:string;label:string;kind:string;enabled:boolean;health_status:string;credential_hint?:string;last_checked_at?:string};
type Audit={id:string;action:string;entity_type:string;created_at:string};
type Detail={
 organization:Institution;role:string;currentUserId:string;members:Membership[];invitations:Invitation[];
 policies:Policy[];connections:Connection[];events:Audit[];
 stats:{active_users:number;pending_invites:number;active_connections:number;total_requests:number;monthly_requests:number};
};
type Section="overview"|"members"|"branding"|"quotas"|"connections"|"audit";
const roles=["admin","manager","member","auditor"];
const periodLabels:Record<string,string>={daily:"Diario",weekly:"Semanal",monthly:"Mensual"};
const roleLabels:Record<string,string>={owner:"Propietario",admin:"Administrador",manager:"Gestor",member:"Miembro",auditor:"Auditor"};
const money=(value:unknown)=>(Number(value||0)/1_000_000).toLocaleString("es-MX",{style:"currency",currency:"USD"});
function field(form:FormData,name:string){return String(form.get(name)||"").trim();}
export default function InstitutionPortal(){
 const [person,setPerson]=useState<Person|null>(null),[institutions,setInstitutions]=useState<Institution[]>([]);
 const [selected,setSelected]=useState(""),[detail,setDetail]=useState<Detail|null>(null);
 const [section,setSection]=useState<Section>("overview"),[connectionMode,setConnectionMode]=useState<"subscriptions"|"api">("subscriptions"),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[success,setSuccess]=useState(""),[invitationLink,setInvitationLink]=useState("");
 const active=institutions.find(o=>o.id===selected);
 const actor=detail?.role||active?.role||"member";
 const mayMembers=["owner","admin","manager"].includes(actor);
 const mayBranding=["owner","admin"].includes(actor);
 const mayAudit=["owner","admin","auditor"].includes(actor);
 const allowedRoles=actor==="manager"?["member","auditor"]:actor==="admin"?["admin",...roles.slice(1)]:roles;
 function loadProfile(){
  fetch("/api/member/me",{cache:"no-store"}).then(async r=>{
   if(r.status===401){window.location.assign("/member/login");return null;}
   const value=await r.json();if(!r.ok)throw new Error(value.error||"No se pudo cargar tu cuenta.");return value;
  }).then(v=>{if(!v)return;setPerson(v.user);setInstitutions(v.institutions||[]);
    setSelected(prev=>(v.institutions||[]).some((o:Institution)=>o.id===prev)?prev:(v.institutions?.[0]?.id||""));
  }).catch(e=>{setError(e.message);setLoading(false);});
 }
 async function loadDetail(id:string){
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/institution/data?organization="+encodeURIComponent(id),{cache:"no-store"});
   const value=await r.json();if(!r.ok)throw Error(value.error||"No se pudo cargar la institución.");
   setDetail(value);
  }catch(e){setDetail(null);setError(e instanceof Error?e.message:"Error de conexión");}
  finally{setLoading(false)}
 }
 useEffect(()=>{loadProfile()},[]);
 useEffect(()=>{if(selected)void loadDetail(selected);else setLoading(false)},[selected]);
 async function change(data:Record<string,unknown>){
  if(!selected)return;
  setSaving(true);setError("");setSuccess("");
  try{
   const r=await fetch("/api/institution/action",{method:"POST",credentials:"same-origin",
     headers:{"content-type":"application/json"},body:JSON.stringify({...data,organizationId:selected})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"No se pudieron guardar los cambios.");
   if(j.invitationPath)setInvitationLink(window.location.origin+j.invitationPath);
   setSuccess("Cambios guardados.");await loadDetail(selected);
   if(data.action==="update_branding")loadProfile();
  }catch(e){setError(e instanceof Error?e.message:"Error de conexión")}
  finally{setSaving(false)}
 }
 function submit(e:FormEvent<HTMLFormElement>,make:(f:FormData)=>Record<string,unknown>){
   e.preventDefault();void change(make(new FormData(e.currentTarget)));
 }
 async function signOut(){await fetch("/api/member/logout",{method:"POST"});window.location.assign("/member/login")}
 if(!selected)return <div className="ip-empty-shell"><header><Link href="/">galeen.</Link><button onClick={signOut}>Salir</button></header>
  <main><h1>Mis instituciones</h1>{loading?<p>Cargando...</p>:<p>{error||"No tienes instituciones activas."}</p>}</main></div>;
 const pending=(detail?.invitations||[]).filter(v=>!v.revoked_at&&!v.accepted_at&&new Date(v.expires_at)>new Date());
 const memberCount=Number(detail?.stats.active_users||0);
 return <div className="ip-shell">
  <aside className="ip-sidebar">
   <Link href="/" className="ip-logo">galeen<span>.</span></Link>
   <div className="ip-workspace">
    <label htmlFor="ip-select">INSTITUCIÓN</label>
    <select id="ip-select" value={selected} onChange={e=>{setSelected(e.target.value);setSection("overview");setInvitationLink("")}}>
      {institutions.map(o=><option key={o.id} value={o.id}>{o.branding?.shortName||o.name}</option>)}
    </select>
    <small>{roleLabels[actor]||actor}</small>
   </div>
   <nav aria-label="Panel institucional">
    {([
      ["overview","◈","Resumen"],
      ["members","♙","Usuarios"],
      ["branding","◫","Identidad visual"],
      ["quotas","▤","Cuotas"],
      ["connections","◇","Recursos de IA"],
      ["audit","▥","Auditoría"]
    ] as const).filter(([id])=>id==="overview"||id==="connections"||(id==="members"&&mayMembers)||
    (id==="branding"&&mayBranding)||(id==="quotas"&&["owner","admin","manager","auditor"].includes(actor))||
    (id==="audit"&&mayAudit)).map(([id,icon,title])=>
     <button key={id} className={section===id?"active":""} onClick={()=>setSection(id)}><span>{icon}</span>{title}</button>)}
   </nav>
   <div className="ip-profile"><div className="ip-initial">{person?.display_name?.[0]?.toUpperCase()||"U"}</div>
    <div><b>{person?.display_name||person?.email||"Mi cuenta"}</b><small>{person?.email}</small></div></div>
  </aside>
  <main className="ip-main">
   <header className="ip-top"><span>{active?.name||"Institución"} <b>/ {section==="overview"?"Resumen":section==="members"?"Usuarios":section==="branding"?"Identidad visual":section==="quotas"?"Cuotas":section==="connections"?"Recursos de IA":"Auditoría"}</b></span>
     <div><button onClick={()=>selected&&loadDetail(selected)} disabled={loading}>Actualizar</button><button onClick={signOut}>Salir</button></div>
   </header>
   <div className="ip-content">
    <div className="ip-heading"><div><p>ESPACIO INSTITUCIONAL</p>
      <h1>{active?.branding?.shortName||active?.name}</h1>
      <span>{active?.slug} · {roleLabels[actor]||actor}</span></div>
      <div className="ip-plan">Plan {active?.plan_code||"standard"}</div>
    </div>
    {error&&<div className="ip-feedback ip-error" role="alert">{error}</div>}
    {success&&<div className="ip-feedback ip-success" role="status">{success}</div>}
    {loading&&!detail&&<div className="ip-card">Cargando institución...</div>}
    {detail&&<div>
     {section==="overview"&&<>
       <div className="ip-stats">
        {[
          ["Miembros activos",memberCount],
          ["Invitaciones",Number(detail.stats.pending_invites)],
          ["Conexiones activas",Number(detail.stats.active_connections)],
          ["Solicitudes del mes",Number(detail.stats.monthly_requests)]
        ].map(([name,val])=><article key={name}><span>{name}</span><strong>{val.toLocaleString("es-MX")}</strong></article>)}
       </div>
       <div className="ip-grid">
        <section className="ip-card"><h2>Accesos rápidos</h2>
         {mayMembers&&<button className="ip-feature" onClick={()=>setSection("members")}><span>♙</span><div><b>Administrar usuarios</b><small>Miembros, invitaciones y permisos</small></div>↗</button>}
         {mayBranding&&<button className="ip-feature" onClick={()=>setSection("branding")}><span>◫</span><div><b>Identidad institucional</b><small>Nombre, imagen y colores</small></div>↗</button>}
         {["owner","admin","manager"].includes(actor)&&<button className="ip-feature" onClick={()=>setSection("quotas")}><span>▤</span><div><b>Administrar cuotas</b><small>Políticas institucionales y por usuario</small></div>↗</button>}
         <button className="ip-feature" onClick={()=>setSection("connections")}><span>◇</span><div><b>Recursos de IA</b><small>Servicios de tu institución</small></div>↗</button>
        </section>
        <section className="ip-card"><h2>Plan institucional</h2>
          <div className="ip-plan-detail"><span>Usuarios permitidos</span><b>{detail.organization.max_users}</b></div>
          <div className="ip-plan-detail"><span>Solicitudes mensuales</span><b>{detail.organization.max_monthly_requests}</b></div>
          <div className="ip-plan-detail"><span>Presupuesto mensual</span><b>{money(detail.organization.max_monthly_micro_usd)}</b></div>
          <div className="ip-plan-detail"><span>Proveedores permitidos</span><b>{detail.organization.allowed_providers?.join(", ")||"Ninguno"}</b></div>
        </section>
       </div>
     </>}
     {section==="members"&&mayMembers&&<>
      <section className="ip-card"><h2>Miembros <span>{detail.members.length}</span></h2>
       {detail.members.length?detail.members.map(m=><form key={m.user_id} className="ip-member" onSubmit={e=>submit(e,f=>({action:"update_member",userId:m.user_id,role:field(f,"role"),status:field(f,"status")}))}>
        <div><b>{m.display_name||m.email}</b><small>{m.email}</small></div>
        <select name="role" defaultValue={m.role} disabled={m.role==="owner"||m.user_id===detail.currentUserId||
          (actor==="manager"&&!["member","auditor"].includes(m.role))||(actor==="admin"&&["owner","admin"].includes(m.role))}>
          {Array.from(new Set([m.role,...allowedRoles])).map(r=><option key={r} value={r}>{roleLabels[r]||r}</option>)}
        </select>
        <select name="status" defaultValue={m.status} disabled={m.role==="owner"||m.user_id===detail.currentUserId||
          (actor==="manager"&&!["member","auditor"].includes(m.role))||(actor==="admin"&&["owner","admin"].includes(m.role))}>
          <option value="active">Activo</option><option value="suspended">Suspendido</option><option value="revoked">Revocado</option>
        </select>
        <button disabled={saving||m.role==="owner"||m.user_id===detail.currentUserId||
          (actor==="manager"&&!["member","auditor"].includes(m.role))||(actor==="admin"&&["owner","admin"].includes(m.role))}>Guardar</button>
       </form>):<div className="ip-empty">No hay miembros registrados.</div>}
      </section>
      <section className="ip-card"><h2>Invitar usuario</h2>
       <form className="ip-form" onSubmit={e=>submit(e,f=>({action:"invite_member",email:field(f,"email"),role:field(f,"role"),days:Number(field(f,"days"))}))}>
        <label>Correo electrónico<input type="email" name="email" maxLength={254} required/></label>
        <label>Rol<select name="role">{allowedRoles.map(r=><option key={r} value={r}>{roleLabels[r]}</option>)}</select></label>
        <label>Vigencia (días)<input type="number" name="days" min="1" max="30" defaultValue="7" required/></label>
        <button className="ip-primary" disabled={saving||memberCount+pending.length>=detail.organization.max_users}>Generar invitación</button>
       </form>
       {invitationLink&&<div className="ip-link"><code>{invitationLink}</code>
        <button onClick={()=>navigator.clipboard.writeText(invitationLink)}>Copiar enlace</button></div>}
      </section>
      <section className="ip-card"><h2>Invitaciones pendientes <span>{pending.length}</span></h2>
       {pending.length?pending.map(inv=><div className="ip-invite" key={inv.id}><div><b>{inv.email}</b><small>{roleLabels[inv.role]||inv.role} · Caduca {new Date(inv.expires_at).toLocaleDateString("es-MX")}</small></div>
        <button disabled={saving||inv.role==="owner"||(actor==="manager"&&!["member","auditor"].includes(inv.role))||(actor==="admin"&&inv.role==="admin")}
          onClick={()=>change({action:"revoke_invitation",invitationId:inv.id})}>Revocar</button></div>):
        <div className="ip-empty">No hay invitaciones pendientes.</div>}
      </section>
     </>}
     {section==="branding"&&mayBranding&&<section className="ip-card">
      <h2>Identidad institucional</h2>
      <form className="ip-form" key={selected} onSubmit={e=>submit(e,f=>({action:"update_branding",branding:{
        shortName:field(f,"name"),primaryColor:field(f,"color"),logoUrl:field(f,"logo")}}))}>
       <label>Nombre corto<input name="name" maxLength={80} defaultValue={detail.organization.branding?.shortName||detail.organization.name}/></label>
       <label>Color institucional<input name="color" type="color" defaultValue={detail.organization.branding?.primaryColor||"#172b44"}/></label>
       <label className="ip-full">URL del logotipo<input type="url" name="logo" maxLength={500} defaultValue={detail.organization.branding?.logoUrl||""}/></label>
       <button className="ip-primary" disabled={saving}>Guardar cambios</button>
      </form>
     </section>}
     {section==="quotas"&&["owner","admin","manager","auditor"].includes(actor)&&<>
      {actor!=="auditor"&&<section className="ip-card"><h2>Crear política de consumo</h2>
       <form className="ip-form" onSubmit={e=>submit(e,f=>({action:"create_policy",period:field(f,"period"),userId:field(f,"user")||null,
        maxRequests:Number(field(f,"requests")),maxMicroUsd:Math.round(Number(field(f,"budget"))*1000000),maxTokens:Number(field(f,"tokens"))}))}>
        <label>Periodo<select name="period"><option value="daily">Diario</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select></label>
        <label>Aplicar a<select name="user"><option value="">Toda la institución</option>{detail.members.filter(m=>m.status==="active").map(m=><option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>
        <label>Solicitudes<input type="number" name="requests" min="1" defaultValue={1000} required/></label>
        <label>Presupuesto USD<input name="budget" type="number" min=".01" step=".01" defaultValue="50" required/></label>
        <label>Tokens<input name="tokens" type="number" min="1" defaultValue={1000000} required/></label>
        <button className="ip-primary" disabled={saving}>Crear política</button>
       </form>
      </section>}
      <section className="ip-card"><h2>Políticas registradas <span>{detail.policies.length}</span></h2>
       {detail.policies.length?detail.policies.map(p=><div className="ip-invite" key={p.id}><div><b>{periodLabels[p.period]||p.period} · {p.user_id?"Individual":"Institucional"}</b>
          <small>{p.max_requests} solicitudes · {money(p.max_micro_usd)} · {p.max_effective_tokens} tokens</small></div>
          {actor!=="auditor"&&<button disabled={saving} onClick={()=>change({action:"delete_policy",policyId:p.id})}>Eliminar</button>}</div>):
        <div className="ip-empty">No hay políticas registradas.</div>}
      </section>
     </>}
     {section==="connections"&&<div>
      <nav className="ip-resource-modes" aria-label="Tipos de conexión">
        <button className={connectionMode==="subscriptions"?"active":""} type="button" onClick={()=>setConnectionMode("subscriptions")}>Cuentas y licencias</button>
        <button className={connectionMode==="api"?"active":""} type="button" onClick={()=>setConnectionMode("api")}>Conexiones API</button>
      </nav>
      {connectionMode==="subscriptions"
        ? <SubscriptionsManager key={selected} organizationId={selected} role={actor} onChanged={()=>{void loadDetail(selected)}}/>
        : <ConnectionsManager organizationId={selected} allowedProviders={detail.organization.allowed_providers||[]} connections={detail.connections} canManage={mayBranding} onSaved={()=>loadDetail(selected)}/>
      }
     </div>} 
     {section==="audit"&&mayAudit&&<section className="ip-card"><h2>Auditoría</h2>
      {detail.events.length?detail.events.map(a=><div className="ip-invite" key={a.id}><div><b>{a.action}</b><small>{a.entity_type}</small></div>
        <span>{new Date(a.created_at).toLocaleDateString("es-MX")}</span></div>):
       <div className="ip-empty">Sin actividad registrada.</div>}
     </section>}
    </div>}
   </div>
  </main>
 </div>;
}

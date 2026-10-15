"use client";
import {useEffect,useState} from "react";
type Org={id:string;name:string;slug:string;role:string;branding:Record<string,string>;plan_code:string;max_users:number;max_monthly_requests:string;allowed_providers:string[]};
type Profile={user:{email:string;display_name:string|null};institutions:Org[]};
export default function Portal(){
const [profile,setProfile]=useState<Profile|null>(null),[error,setError]=useState("");
useEffect(()=>{fetch("/api/member/me",{cache:"no-store"}).then(async r=>{if(r.status===401){window.location.assign("/member/login");return null}const j=await r.json();if(!r.ok)throw Error(j.error);return j}).then(j=>j&&setProfile(j)).catch(e=>setError(e.message))},[]);
async function logout(){await fetch("/api/member/logout",{method:"POST"});window.location.assign("/member/login")}
return <main style={{minHeight:"100vh",background:"#f7f8fb",color:"#1a2d44",padding:30}}>
<header style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><strong style={{fontSize:26}}>galeen.</strong><button onClick={logout}>Cerrar sesión</button></header>
<section style={{maxWidth:1100,margin:"60px auto"}}><h1>Mis instituciones</h1><p>Bienvenido{profile?.user.display_name?" "+profile.user.display_name:""}.</p>{error&&<p role="alert">{error}</p>}
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:18}}>
{profile?.institutions.map(o=><article key={o.id} style={{background:"white",border:"1px solid #e5eaf0",borderTop:"4px solid "+(o.branding?.primaryColor||"#b69363"),padding:25,borderRadius:12}}>
<h2>{o.branding?.shortName||o.name}</h2><p>Rol: {o.role}</p><p>Plan: {o.plan_code}</p><p>Máximo de usuarios: {o.max_users}</p><p>Solicitudes mensuales: {o.max_monthly_requests}</p><p>Proveedores permitidos: {o.allowed_providers?.join(", ")||"Ninguno"}</p>
</article>)}
</div>{profile?.institutions.length===0&&<p>No tienes membresías activas.</p>}</section></main>
}
"use client";
import {useParams} from "next/navigation";
import {useEffect,useState,type FormEvent} from "react";
type Detail={email:string;role:string;organizationName:string};
export default function Invite(){
const {token}=useParams<{token:string}>();const [info,setInfo]=useState<Detail|null>(null),[error,setError]=useState(""),[name,setName]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false);
useEffect(()=>{if(!token)return;fetch("/api/invitation?token="+encodeURIComponent(token),{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error);return j}).then(setInfo).catch(e=>setError(e.message))},[token]);
async function submit(e:FormEvent<HTMLFormElement>){
e.preventDefault();setBusy(true);setError("");
try{const r=await fetch("/api/invitation",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token,name,password})});const j=await r.json();if(!r.ok)throw Error(j.error);window.location.assign("/portal")}
catch(e){setError(e instanceof Error?e.message:"Error");}finally{setBusy(false)}
}
return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f7f8fb",padding:20}}><section style={{background:"white",border:"1px solid #e5e9ef",borderRadius:14,padding:32,maxWidth:480,width:"100%"}}>
<h1>Invitación a GALEEN</h1>{!info&&!error&&<p>Verificando invitación...</p>}
{info&&<><p>Invitación para {info.email} a <b>{info.organizationName}</b> como {info.role}.</p>
<form onSubmit={submit} style={{display:"grid",gap:15}}>
<label>Nombre completo<input required minLength={2} maxLength={180} value={name} onChange={e=>setName(e.target.value)} style={{width:"100%",padding:12}}/></label>
<label>Contraseña para usuario nuevo<input type="password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} style={{width:"100%",padding:12}}/></label>
<p style={{fontSize:12}}>Si ya tienes una cuenta GALEEN con este correo, inicia sesión primero. Los usuarios nuevos necesitan una contraseña de al menos 12 caracteres con letras y números.</p>
<button disabled={busy} style={{background:"#172b44",border:0,color:"white",padding:12,borderRadius:8}}>{busy?"Validando...":"Aceptar invitación"}</button></form></>}
{error&&<p role="alert" style={{color:"firebrick"}}>{error}</p>}
<a href="/member/login">Iniciar sesión en mi cuenta</a></section></main>
}
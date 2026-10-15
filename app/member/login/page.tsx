"use client";
import {useState,type FormEvent} from "react";
export default function MemberLogin(){
const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
async function submit(e:FormEvent<HTMLFormElement>){
 e.preventDefault();setBusy(true);setError("");
 try {const r=await fetch("/api/member/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
 const j=await r.json();if(!r.ok)throw Error(j.error||"No se pudo iniciar sesión");window.location.assign("/portal")}
 catch(e){setError(e instanceof Error?e.message:"Error");}finally{setBusy(false)}
}
return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f7f8fb",padding:20}}>
<form onSubmit={submit} style={{background:"white",maxWidth:430,width:"100%",borderRadius:15,border:"1px solid #e0e6ee",padding:33}}>
<h1>GALEEN</h1><p>Acceso de usuarios institucionales</p>
<label style={{display:"grid",gap:8,marginBottom:18}}>Correo<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{padding:12}}/></label>
<label style={{display:"grid",gap:8,marginBottom:18}}>Contraseña<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={{padding:12}}/></label>
{error&&<p role="alert" style={{color:"firebrick"}}>{error}</p>}
<button disabled={busy} style={{width:"100%",background:"#172b44",color:"white",border:0,borderRadius:8,padding:12}}>{busy?"Verificando...":"Iniciar sesión"}</button>
</form></main>
}
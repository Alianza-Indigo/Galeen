import Link from "next/link";
import {cookies} from "next/headers";
import {COOKIE_NAME,verifyEdgeSession} from "@/lib/admin-session-edge";
import {MEMBER_COOKIE,readMemberSession} from "@/lib/tenant-session";
export const dynamic="force-dynamic";
export default async function Start(){
 const jar=await cookies();
 const admin=await verifyEdgeSession(jar.get(COOKIE_NAME)?.value);
 const member=Boolean(readMemberSession(jar.get(MEMBER_COOKIE)?.value));
 const card={border:"1px solid #dce3ec",borderRadius:11,padding:20,color:"#1b2e45",textDecoration:"none",display:"block"};
 return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#f7f8fb"}}><section style={{width:"100%",maxWidth:680,background:"white",border:"1px solid #e4e9f0",borderRadius:18,padding:40}}>
  <div style={{fontSize:31,fontWeight:800,color:"#142137"}}>galeen.</div><h1 style={{fontSize:27,margin:"25px 0 8px"}}>Bienvenido a GALEEN</h1>
  <p style={{color:"#8190a3",fontSize:13,marginBottom:27}}>Selecciona tu espacio de trabajo.</p>
  <div style={{display:"grid",gap:13}}>
   <Link href={member?"/portal":"/member/login"} style={card}><strong>Acceso institucional →</strong><div style={{color:"#8695a7",fontSize:12,marginTop:7}}>Administración de tu institución</div></Link>
   <Link href={admin?"/admin":"/login"} style={card}><strong>Superadministración →</strong><div style={{color:"#8695a7",fontSize:12,marginTop:7}}>Gestión general de GALEEN</div></Link>
  </div>
 </section></main>;
}

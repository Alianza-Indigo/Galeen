import Link from "next/link";

export const metadata = {
  title: "GALEEN | Inteligencia para organizaciones",
  description: "Accede a tu espacio de trabajo institucional en GALEEN."
};

export default function Home() {
  return <main style={{minHeight:"100vh",background:"#f6f8fb",color:"#182a43",display:"flex",flexDirection:"column"}}>
    <header style={{background:"#fff",borderBottom:"1px solid #e4e9ef",padding:"21px clamp(24px,6vw,100px)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:18}}>
      <Link href="/" style={{fontWeight:850,letterSpacing:-1.3,fontSize:29,textDecoration:"none",color:"#142640"}}>galeen<span style={{color:"#c79d6d"}}>.</span></Link>
      <Link href="/member/login" style={{padding:"11px 18px",borderRadius:9,background:"#182c45",color:"#fff",textDecoration:"none",fontWeight:650,fontSize:13}}>Iniciar sesión</Link>
    </header>
    <section style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"70px 24px"}}>
      <div style={{maxWidth:920,width:"100%",display:"grid",gap:26}}>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:2.5,color:"#ab7d47"}}>GALEEN · INTELIGENCIA CONECTADA</div>
        <h1 style={{fontSize:"clamp(40px,6vw,66px)",lineHeight:1.08,letterSpacing:-2,margin:0,fontWeight:800}}>La inteligencia de tu organización, en un solo lugar.</h1>
        <p style={{color:"#74849a",fontSize:17,lineHeight:1.8,maxWidth:630,margin:0}}>Accede a tus herramientas y recursos de inteligencia artificial desde el espacio de trabajo de tu institución.</p>
        <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:12}}>
          <Link href="/member/login" style={{display:"inline-block",background:"#182c45",color:"#fff",padding:"15px 25px",borderRadius:10,textDecoration:"none",fontSize:14,fontWeight:750}}>Acceder a mi institución →</Link>
          <Link href="/login" style={{display:"inline-block",background:"#fff",color:"#314761",border:"1px solid #d9e0e9",padding:"15px 25px",borderRadius:10,textDecoration:"none",fontSize:14,fontWeight:700}}>Administración general</Link>
        </div>
      </div>
    </section>
    <footer style={{padding:"23px 24px",borderTop:"1px solid #e5eaf0",textAlign:"center",fontSize:12,color:"#94a2b3"}}>GALEEN · Plataforma institucional</footer>
  </main>;
}

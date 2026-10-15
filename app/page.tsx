"use client";
import { useEffect, useState } from "react";

const sections = [
  { id: "overview", label: "Resumen", symbol: "◈" },
  { id: "institutions", label: "Instituciones", symbol: "▦" },
  { id: "connections", label: "Proveedores de IA", symbol: "◇" },
  { id: "people", label: "Usuarios y roles", symbol: "♙" },
  { id: "usage", label: "Consumo y cuotas", symbol: "▤" },
  { id: "settings", label: "Configuración", symbol: "⚙" }
] as const;
type Tab = typeof sections[number]["id"];
const titles: Record<Tab, [string, string]> = {
  overview: ["Centro de control", "Una plataforma para administrar la inteligencia artificial de todas tus instituciones."],
  institutions: ["Instituciones", "Espacios independientes con sus propios administradores y recursos."],
  connections: ["Proveedores de IA", "Cada institución conectará sus propias credenciales autorizadas."],
  people: ["Usuarios y roles", "Control institucional de accesos y permisos."],
  usage: ["Consumo y cuotas", "Presupuestos y métricas de uso por institución."],
  settings: ["Configuración", "Estado de la infraestructura y requisitos de activación."]
};
const features = [
  ["▦", "Multiinstitución", "Usuarios y datos aislados por organización."],
  ["◇", "Conexiones BYO", "Conexiones oficiales bajo control de cada cliente."],
  ["▤", "Cuotas y consumo", "Medición y presupuestos institucionales."],
  ["✧", "Marca blanca", "Personalización para escuelas y organizaciones."]
];
type Components = Record<string,string>;
export default function Home() {
  const [tab, setTab] = useState<Tab>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [components, setComponents] = useState<Components>({});
  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then(r => r.json()).then(r => setComponents(r.components || {})).catch(() => {});
  }, []);
  async function signOut() { await fetch("/api/admin/logout", {method: "POST"}); window.location.assign("/login"); }
  return (
    <div className="shell">
      <aside className={"sidebar" + (mobileMenu ? " sidebar-open" : "")}>
        <div className="brand"><span className="brand-symbol">✣</span><div><strong>galeen<span className="accent">.</span></strong><small>AI INFRASTRUCTURE</small></div></div>
        <div className="workspace"><span className="workspace-avatar">G</span><div><b>GALEEN</b><small>Consola institucional</small></div></div>
        <p className="nav-heading">PLATAFORMA</p>
        <nav aria-label="Módulos de GALEEN">
          {sections.map(s => <button type="button" key={s.id} className={"nav-link " + (tab === s.id ? "active" : "")} onClick={() => { setTab(s.id); setMobileMenu(false); }}>
            <span>{s.symbol}</span>{s.label}
          </button>)}
        </nav>
        <div className="sidebar-end"><b>BYO por diseño</b><p>La institución controla sus propias conexiones y capacidad de IA.</p></div>
      </aside>
      <main className="main">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Mostrar navegación">☰</button><span>GALEEN <span className="muted">/ {titles[tab][0]}</span></span><div style={{display:"flex",alignItems:"center",gap:12}}><span className="pill">Superadministrador</span><button type="button" onClick={signOut} style={{border:"1px solid #d8dee7",background:"white",borderRadius:8,padding:"8px 12px",fontWeight:600}}>Salir</button></div></header>
        <div className="content">
          <div className="eyebrow">CONSOLA INSTITUCIONAL / {tab.toUpperCase()}</div>
          <h1>{titles[tab][0]}</h1><p><a href="/admin/manage" style={{display:"inline-block",marginTop:12,marginBottom:12,padding:"11px 16px",borderRadius:9,background:"#1c304b",color:"#fff",textDecoration:"none",fontWeight:700,fontSize:12}}>Administrar instituciones →</a></p><p className="lead">{titles[tab][1]}</p>
          <div className="notice"><b>Instalación inicial</b><span>La interfaz está disponible. La administración y las conexiones reales se habilitarán después de configurar Neon, autenticación y permisos.</span><button onClick={() => setTab("settings")}>Ver requisitos →</button></div>
          {tab === "overview" && <>
            <div className="stats">{[["Instituciones","0","Sin instituciones registradas"],["Usuarios activos","0","Sin usuarios registrados"],["Conexiones de IA","0","Aún sin proveedores"],["Solicitudes","0","Sin tráfico real"]].map(a => <article className="stat" key={a[0]}><small>{a[0]}</small><strong>{a[1]}</strong><span>{a[2]}</span></article>)}</div>
            <div className="section-heading"><h2>Una consola. Todas tus organizaciones.</h2><p>Infraestructura multiinstitucional, escalable y de marca blanca.</p></div>
            <div className="features">{features.map(f => <article className="feature" key={f[1]}><div className="feature-symbol">{f[0]}</div><h3>{f[1]}</h3><p>{f[2]}</p></article>)}</div>
            <div className="two-panels"><section className="panel"><h3>Actividad reciente</h3><div className="empty"><span>◎</span><h3>Esperando primeras conexiones</h3><p>Aquí aparecerán los eventos reales de la plataforma.</p></div></section><section className="panel"><h3>Preparación de GALEEN</h3><div className="progress"><div /></div>{["Proyecto en Vercel creado","Conectar base de datos Neon","Activar autenticación","Conectar proveedores autorizados","Verificar cuotas y facturación"].map((s,i)=><p className="task" key={s}><span>{i===0?"✓":"○"}</span>{s}</p>)}</section></div>
          </>}
          {tab === "institutions" && <section className="panel"><h3>Directorio institucional</h3><div className="empty"><span>▦</span><h3>Todavía no hay instituciones</h3><p>El alta estará disponible cuando la persistencia y los controles de acceso estén habilitados.</p></div></section>}
          {tab === "connections" && <><div className="providers">{["OpenAI","Anthropic","Google Gemini","OpenRouter"].map(n=><article className="provider" key={n}><span>{n.slice(0,1)}</span><b>{n}</b><small>Sin conectar</small></article>)}</div><section className="panel"><h3>Cuentas administradas por cada institución</h3><p className="lead">GALEEN gestiona las conexiones técnicas, pero las claves y servicios autorizados pertenecen a los clientes.</p></section></>}
          {tab === "people" && <section className="panel"><h3>Usuarios y permisos</h3><div className="empty"><span>♙</span><h3>Sin usuarios registrados</h3><p>Se contemplan superadministrador, propietario institucional, administrador, gestor y usuarios finales.</p></div></section>}
          {tab === "usage" && <section className="panel"><h3>Consumo real</h3><div className="empty"><span>▤</span><h3>Aún no hay mediciones</h3><p>Los informes registrarán exclusivamente solicitudes reales procesadas.</p></div></section>}
          {tab === "settings" && <section className="panel"><h3>Estado de integraciones</h3>{[["frontend","Aplicación Next.js"],["tenantDatabase","Neon PostgreSQL"],["sessionSigning","Firma de sesiones"],["providerVault","Bóveda de credenciales"],["billing","Facturación Stripe"]].map(([k,n])=><div className="config-row" key={k}><span className={components[k]==="ready"||components[k]==="configured"?"ready-dot":"pending-dot"} /><div><strong>{n}</strong><small>{components[k]==="ready"?"Preparado":components[k]==="configured"?"Variable configurada; integración por verificar":"Pendiente"}</small></div></div>)}<p className="lead">Los indicadores solo muestran variables presentes; no sustituyen las pruebas de integración ni de seguridad.</p></section>}
        </div>
        <footer>GALEEN · Inteligencia conectada · Infraestructura BYO</footer>
      </main>
    </div>
  );
}

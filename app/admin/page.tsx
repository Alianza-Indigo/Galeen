"use client";
import { useEffect, useState } from "react";

const tabs = [
  { id: "overview", label: "Resumen", symbol: "◈" },
  { id: "institutions", label: "Instituciones", symbol: "▦" },
  { id: "connections", label: "Conexiones", symbol: "◇" },
  { id: "people", label: "Usuarios", symbol: "♙" },
  { id: "usage", label: "Consumo", symbol: "▤" },
  { id: "settings", label: "Configuración", symbol: "⚙" }
] as const;
type Tab = (typeof tabs)[number]["id"];
type Organization = {
  id: string; name: string; slug: string; status: string;
  plan_code: string | null; active_users: number; active_connections: number;
};
type Stats = { total_users: number; active_orgs: number; requests: number };
type Dashboard = { organizations: Organization[]; stats: Stats | null };

const titles: Record<Tab, string> = {
  overview: "Centro de control",
  institutions: "Instituciones",
  connections: "Conexiones",
  people: "Usuarios",
  usage: "Consumo",
  settings: "Configuración"
};
const statusNames: Record<string,string> = {
  active: "Activa", suspended: "Suspendida", closed: "Cerrada"
};
function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="home-empty"><span className="home-empty-icon">◇</span>
    <h3>{title}</h3><p>{description}</p></div>;
}
function OrganizationList({ organizations }: { organizations: Organization[] }) {
  if (!organizations.length) return <EmptyState title="Sin instituciones" description="Crea tu primera institución para comenzar."/>;
  return <div className="home-org-list">{organizations.map(org =>
    <div className="home-org-item" key={org.id}>
      <div className="home-org-avatar">{org.name.trim().charAt(0).toUpperCase()}</div>
      <div className="home-org-details"><strong>{org.name}</strong><span>{org.slug} · {org.plan_code ?? "Sin plan"}</span></div>
      <span className={"home-status home-status-"+org.status}>{statusNames[org.status] ?? org.status}</span>
      <a href="/admin/manage" aria-label={"Administrar "+org.name} className="home-arrow">↗</a>
    </div>
  )}</div>;
}
export default function Home() {
  const [tab, setTab] = useState<Tab>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(true);

  async function loadDashboard() {
    setBusy(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin/data", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No fue posible cargar los datos.");
      setDashboard({ organizations: result.organizations ?? [], stats: result.stats ?? null });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No fue posible cargar los datos.");
    } finally { setBusy(false); }
  }
  useEffect(() => { void loadDashboard(); }, []);
  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.assign("/login");
  }
  const organizations = dashboard?.organizations ?? [];
  const stats = dashboard?.stats;
  const connections = organizations.reduce((sum, org) => sum + Number(org.active_connections || 0), 0);
  const count = (value: number | undefined) => !dashboard ? "—" : (value ?? 0).toLocaleString("es-MX");

  return <div className="shell">
    <aside className={"sidebar"+(mobileMenu ? " sidebar-open" : "")}>
      <div className="brand"><span className="brand-symbol">✣</span><div>
        <strong>galeen<span className="accent">.</span></strong><small>CONSOLA</small>
      </div></div>
      <div className="workspace"><span className="workspace-avatar">G</span><div>
        <b>GALEEN</b><small>Administración general</small>
      </div></div>
      <p className="nav-heading">MENÚ PRINCIPAL</p>
      <nav aria-label="Navegación">
        {tabs.map(item => <button type="button" key={item.id}
          className={"nav-link"+(tab === item.id ? " active" : "")}
          onClick={() => {setTab(item.id);setMobileMenu(false);}}>
          <span>{item.symbol}</span>{item.label}
        </button>)}
      </nav>
      <div className="home-sidebar-bottom"><span className="home-avatar">SA</span>
        <span><strong>Superadministrador</strong><small>Cuenta principal</small></span>
      </div>
    </aside>
    {mobileMenu && <button className="home-overlay" aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} />}
    <main className="main">
      <header className="topbar">
        <button type="button" className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú">☰</button>
        <div className="home-breadcrumb">GALEEN <span>/</span> {titles[tab]}</div>
        <div className="home-top-actions">
          <a href="/admin/manage" className="home-manage-link">Administrar</a>
          <button type="button" className="home-signout" onClick={signOut}>Salir</button>
        </div>
      </header>
      <div className="content">
        <div className="eyebrow">ADMINISTRACIÓN GENERAL</div>
        <div className="home-heading">
          <div><h1>{titles[tab]}</h1><p>{tab === "overview" ? "Información de tu plataforma en un solo lugar." :
            tab === "institutions" ? "Organizaciones y espacios de trabajo." :
            tab === "connections" ? "Recursos conectados por institución." :
            tab === "people" ? "Miembros de la plataforma." :
            tab === "usage" ? "Actividad y límites de consumo." : "Gestión de tu cuenta y accesos."}</p></div>
          <button type="button" onClick={() => void loadDashboard()} disabled={busy} className="home-refresh">↻ Actualizar</button>
        </div>
        {loadError && <div className="home-error" role="alert">{loadError}</div>}

        {tab === "overview" && <>
          <div className="stats">
            {[
              ["Instituciones", count(organizations.length)],
              ["Usuarios", count(stats?.total_users)],
              ["Conexiones", count(connections)],
              ["Solicitudes", count(stats?.requests)]
            ].map(([label, value]) => <article className="stat" key={label}>
              <small>{label}</small><strong>{value}</strong>
            </article>)}
          </div>
          <div className="home-overview-grid">
            <section className="panel">
              <div className="home-panel-heading"><h2>Instituciones</h2><a href="/admin/manage">Ver todas ↗</a></div>
              <OrganizationList organizations={organizations.slice(0,6)} />
            </section>
            <section className="panel">
              <div className="home-panel-heading"><h2>Accesos rápidos</h2></div>
              <a className="home-action-item" href="/admin/manage"><span>▦</span>
                <div><strong>Administrar instituciones</strong><small>Altas, usuarios, planes y permisos</small></div><b>↗</b></a>
              <a className="home-action-item" href="/member/login"><span>♙</span>
                <div><strong>Portal institucional</strong><small>Acceso de miembros</small></div><b>↗</b></a>
            </section>
          </div>
        </>}

        {tab === "institutions" && <section className="panel">
          <div className="home-panel-heading"><h2>Directorio</h2><a href="/admin/manage">Administrar ↗</a></div>
          <OrganizationList organizations={organizations}/>
        </section>}

        {tab === "connections" && <section className="panel">
          <div className="home-panel-heading"><h2>Conexiones por institución</h2>
            <span className="home-count">{count(connections)} registradas</span></div>
          {organizations.length ? organizations.map(org => <div className="home-org-item" key={org.id}>
            <div className="home-org-avatar">◇</div><div className="home-org-details"><strong>{org.name}</strong><span>{org.slug}</span></div>
            <span className="home-count">{org.active_connections} activas</span>
          </div>) : <EmptyState title="Sin conexiones" description="Las conexiones aparecerán aquí al registrarse."/>}
        </section>}

        {tab === "people" && <section className="panel">
          <div className="home-panel-heading"><h2>Usuarios por institución</h2>
            <span className="home-count">{count(stats?.total_users)} usuarios</span></div>
          {organizations.length ? organizations.map(org => <div className="home-org-item" key={org.id}>
            <div className="home-org-avatar">♙</div><div className="home-org-details"><strong>{org.name}</strong><span>{org.slug}</span></div>
            <span className="home-count">{org.active_users} activos</span>
            <a href="/admin/manage" className="home-arrow">↗</a>
          </div>) : <EmptyState title="Sin usuarios" description="Los miembros aparecerán al aceptar una invitación."/>}
        </section>}

        {tab === "usage" && <div className="home-usage-layout">
          <section className="panel"><h2>Solicitudes registradas</h2><div className="home-large-number">{count(stats?.requests)}</div></section>
          <section className="panel"><div className="home-panel-heading"><h2>Límites y presupuestos</h2>
            <a href="/admin/manage">Administrar ↗</a></div>
            {organizations.length ? organizations.map(org => <div className="home-org-item" key={org.id}>
              <div className="home-org-avatar">▤</div><div className="home-org-details"><strong>{org.name}</strong><span>{org.plan_code ?? "Sin plan"}</span></div>
            </div>) : <EmptyState title="Sin instituciones" description="Los planes aparecerán cuando registres una institución."/>}
          </section>
        </div>}

        {tab === "settings" && <section className="panel">
          <div className="home-panel-heading"><h2>Cuenta y accesos</h2></div>
          <div className="home-account-row"><span className="home-avatar">SA</span>
            <div><strong>Superadministrador</strong><small>Control general de GALEEN</small></div>
          </div>
          <a className="home-action-item" href="/admin/manage"><span>▦</span>
            <div><strong>Gestión institucional</strong><small>Instituciones, usuarios y planes</small></div><b>↗</b></a>
        </section>}
      </div>
      <footer>GALEEN · Plataforma institucional</footer>
    </main>
  </div>;
}

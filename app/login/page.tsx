"use client";
import { FormEvent, useState } from "react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error ?? "No fue posible acceder");
        return;
      }
      window.location.assign("/");
    } catch {
      setError("No fue posible conectar con el servidor");
    } finally {
      setSubmitting(false);
    }
  }

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "#f5f7fb" }}>
    <form onSubmit={submit} style={{ width: "100%", maxWidth: 410, padding: 36, background: "#fff", borderRadius: 18, border: "1px solid #e3e9f1", boxShadow: "0 14px 50px #101c3014" }}>
      <h1 style={{ fontSize: 36, marginTop: 0 }}>galeen<span style={{ color: "#bc8b4e" }}>.</span></h1>
      <p style={{ color: "#758398", fontSize: 14 }}>Consola privada · Superadministrador</p>
      <label htmlFor="admin-user" style={{ display: "block", marginTop: 25, marginBottom: 8, fontSize: 13 }}>Usuario</label>
      <input id="admin-user" value={username} onChange={e => setUsername(e.target.value)}
        autoComplete="username" maxLength={128} required
        style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd4df", fontSize: 15 }} />
      <label htmlFor="admin-password" style={{ display: "block", marginTop: 18, marginBottom: 8, fontSize: 13 }}>Contraseña</label>
      <input id="admin-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
        autoComplete="current-password" maxLength={512} required
        style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #cbd4df", fontSize: 15 }} />
      {error && <p role="alert" style={{ color: "#b3261e", fontSize: 13 }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ width: "100%", marginTop: 24, padding: 14, border: 0, borderRadius: 9, background: "#172940", color: "white", fontWeight: 700 }}>
        {submitting ? "Verificando..." : "Iniciar sesión"}
      </button>
    </form>
  </main>;
}

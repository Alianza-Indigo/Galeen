"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import "./shared-accounts.css";
import "./pool-broker.css";
import PoolBrokerPanel from "./PoolBrokerPanel";

type Resource={
  id:string;provider:string;label:string;account_alias:string;
  max_assignees:number;max_concurrent:number;lease_minutes:number;
  status:"active"|"paused"|"retired";connection_status:string;
  pool_key_hint:string|null;pool_model:string|null;pool_verified_at:string|null;
  assignee_count:number;busy_count:number
};
type Member={id:string;resource_id:string;user_id:string;email:string;display_name:string|null};
type Reservation={id:string;resource_id:string;user_id:string;email:string;display_name:string|null;expires_at:string};
type Person={user_id:string;email:string;display_name:string|null};
type PoolState={role:string;resources:Resource[];assigned:Member[];reservations:Reservation[];users:Person[]};
type Props={organizationId:string;role:string;userId:string};
const empty:PoolState={role:"member",resources:[],assigned:[],reservations:[],users:[]};
const providers=[
  {value:"openai",label:"ChatGPT"},
  {value:"anthropic",label:"Claude"},
  {value:"google",label:"Gemini"},
  {value:"microsoft",label:"Copilot"},
  {value:"other",label:"Otro"}
];
const statusNames={active:"Activa",paused:"Pausada",retired:"Retirada"};
const read=(f:FormData,key:string)=>String(f.get(key)||"").trim();

export default function SharedAccountsManager({organizationId,role,userId}:Props){
  const [data,setData]=useState<PoolState>(empty);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [creating,setCreating]=useState(false);
  const [editing,setEditing]=useState("");
  const [selection,setSelection]=useState<Record<string,string>>({});
  const [now,setNow]=useState(Date.now());
  const canManage=["owner","admin"].includes(role);
  const canAllocate=["owner","admin","manager"].includes(role);
  const load=useCallback(async()=>{
    setLoading(true);
    try {
      const result=await fetch("/api/institution/shared-accounts?organization="+encodeURIComponent(organizationId),{cache:"no-store"});
      const value=await result.json();
      if(!result.ok)throw new Error(value.error||"No se pudo cargar las cuentas.");
      setData({
        resources:value.resources||[],assigned:value.assigned||[],
        reservations:value.reservations||[],users:value.users||[],role:value.role||"member"
      });
    }catch(e){setError(e instanceof Error?e.message:"Error de conexión");}
    finally{setLoading(false);}
  },[organizationId]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{
    const timer=setInterval(()=>setNow(Date.now()),30000);
    return ()=>clearInterval(timer);
  },[]);
  async function act(action:string,options:Record<string,unknown>){
    setBusy(true);setError("");setNotice("");
    try {
      const result=await fetch("/api/institution/shared-accounts",{
        method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
        body:JSON.stringify({organizationId,action,...options})
      });
      const value=await result.json();
      if(!result.ok)throw new Error(value.error||"No se pudo realizar la operación.");
      setNotice(action==="reserve"?"Turno reservado.":"Cambios guardados.");
      setEditing("");setCreating(false);
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Error de conexión");}
    finally{setBusy(false);}
  }
  const formValues=(f:FormData)=>({
    label:read(f,"label"),provider:read(f,"provider"),
    accountAlias:read(f,"alias"),
    maxAssignees:Number(read(f,"assignees")),
    maxConcurrent:Number(read(f,"concurrent")),
    leaseMinutes:Number(read(f,"minutes"))
  });
  function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    void act("create",formValues(new FormData(e.currentTarget)));
  }
  function update(e:FormEvent<HTMLFormElement>,r:Resource){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    void act("update",{...formValues(f),resourceId:r.id,status:read(f,"status")});
  }
  return <div className="sa-wrapper">
    <section className="ip-card">
      <div className="sa-heading">
        <h2>Cuentas compartidas ({data.resources.length})</h2>
        {canManage&&<button type="button" className="sa-action" disabled={busy}
          onClick={()=>{setCreating(!creating);setEditing("");}}>
          {creating?"Cancelar":"+ Agregar cuenta"}
        </button>}
      </div>
      {error&&<div className="ip-feedback ip-error" role="alert">{error}</div>}
      {notice&&<div className="ip-feedback ip-success" role="status">{notice}</div>}
      {canManage&&creating&&<form className="sa-form" onSubmit={create}>
        <label>Proveedor<select name="provider">{providers.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
        <label>Nombre de referencia<input name="label" minLength={2} maxLength={120} placeholder="Cuenta principal" required/></label>
        <label>Identificador de cuenta<input name="alias" minLength={2} maxLength={120} placeholder="Cuenta del titular" required/></label>
        <label>Usuarios autorizados<input name="assignees" type="number" min="1" max="1000" defaultValue="5" required/></label>
        <label>Turnos simultáneos<input name="concurrent" type="number" min="1" max="50" defaultValue="1" required/></label>
        <label>Minutos por turno<input name="minutes" type="number" min="5" max="120" defaultValue="30" required/></label>
        <div className="sa-form-actions"><button className="ip-primary" disabled={busy}>Agregar</button></div>
      </form>}
      {loading&&<div className="ip-empty">Cargando...</div>}
      {!loading&&!data.resources.length&&<div className="ip-empty">No hay cuentas compartidas registradas.</div>}
      {data.resources.map(resource=>{
        const assigned=data.assigned.filter(m=>m.resource_id===resource.id);
        const active=data.reservations.filter(r=>r.resource_id===resource.id&&new Date(r.expires_at).getTime()>now);
        const myTurn=active.find(r=>r.user_id===userId);
        const myMembership=assigned.find(m=>m.user_id===userId);
        const hasPlace=active.length<resource.max_concurrent;
        const provider=providers.find(p=>p.value===resource.provider);
        return <article className="sa-resource" key={resource.id}>
          <div className="sa-title">
            <div><strong>{resource.label}</strong>
              <small>{provider?.label||resource.provider} · {resource.account_alias}</small>
            </div>
            <span className={"sa-state sa-state-"+resource.status}>{statusNames[resource.status]}</span>
          </div>
          <div className="sa-metrics">
            <span>{resource.assignee_count} / {resource.max_assignees} usuarios</span>
            <span>{active.length} / {resource.max_concurrent} turnos ocupados</span>
            <span>{resource.lease_minutes} min / turno</span>
          </div>
          {resource.status==="active"&&(myMembership||["owner","admin","manager"].includes(role))&&
            <div className="sa-turn">
              {myTurn?<><span>Tu turno termina a las {new Date(myTurn.expires_at).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</span>
                  <button disabled={busy} onClick={()=>void act("release",{resourceId:resource.id,reservationId:myTurn.id})}>Finalizar turno</button></>
              :myMembership?<><span>{hasPlace?"Turno disponible":"Sin turnos disponibles"}</span>
                  <button disabled={busy||!hasPlace} onClick={()=>void act("reserve",{resourceId:resource.id})}>Reservar turno</button></>
              :<span>Usuarios asignados pueden reservar turnos.</span>}
            </div>}
          <PoolBrokerPanel organizationId={organizationId} resourceId={resource.id}
            provider={resource.provider} status={resource.connection_status}
            hint={resource.pool_key_hint} model={resource.pool_model} canManage={canManage}
            hasTurn={Boolean(myTurn)} onChange={load}/>
          {canManage&&<div className="sa-controls">
            <button disabled={busy} onClick={()=>setEditing(editing===resource.id?"":resource.id)}>Configurar</button>
          </div>}
          {canManage&&editing===resource.id&&<form className="sa-form sa-edit" onSubmit={e=>update(e,resource)}>
            <label>Nombre<input name="label" minLength={2} maxLength={120} defaultValue={resource.label} required/></label>
            <label>Identificador<input name="alias" minLength={2} maxLength={120} defaultValue={resource.account_alias} required/></label>
            <input type="hidden" name="provider" defaultValue={resource.provider}/>
            <label>Usuarios autorizados<input name="assignees" type="number" min="1" max="1000" defaultValue={resource.max_assignees} required/></label>
            <label>Turnos simultáneos<input name="concurrent" type="number" min="1" max="50" defaultValue={resource.max_concurrent} required/></label>
            <label>Minutos por turno<input name="minutes" type="number" min="5" max="120" defaultValue={resource.lease_minutes} required/></label>
            <label>Estado<select name="status" defaultValue={resource.status}>
              <option value="active">Activa</option><option value="paused">Pausada</option><option value="retired">Retirada</option>
            </select></label>
            <div className="sa-form-actions"><button className="ip-primary" disabled={busy}>Guardar</button></div>
          </form>}
          {canAllocate&&<div className="sa-users">
            <h3>Usuarios autorizados</h3>
            {assigned.map(user=><div className="sa-person" key={user.id}>
              <span>{user.display_name||user.email}<small>{user.email}</small></span>
              <button disabled={busy} onClick={()=>void act("revoke",{resourceId:resource.id,userId:user.user_id})}>Revocar</button>
            </div>)}
            {!assigned.length&&<p>No hay usuarios asignados.</p>}
            {resource.status!=="retired"&&Number(resource.assignee_count)<resource.max_assignees&&
              <form className="sa-assign" onSubmit={e=>{
                e.preventDefault();
                if(selection[resource.id])void act("assign",{resourceId:resource.id,userId:selection[resource.id]});
              }}>
                <select aria-label="Usuario" value={selection[resource.id]||""}
                  onChange={e=>setSelection(s=>({...s,[resource.id]:e.target.value}))}>
                  <option value="">Selecciona un usuario</option>
                  {data.users.filter(u=>!assigned.some(m=>m.user_id===u.user_id)).map(u=>
                    <option value={u.user_id} key={u.user_id}>{u.display_name||u.email}</option>)}
                </select>
                <button disabled={busy||!selection[resource.id]}>Asignar</button>
              </form>}
          </div>}
          {canAllocate&&active.length>0&&<div className="sa-users">
            <h3>Turnos activos</h3>
            {active.map(turn=><div className="sa-person" key={turn.id}>
              <span>{turn.display_name||turn.email}<small>Hasta {new Date(turn.expires_at).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}</small></span>
              <button disabled={busy} onClick={()=>void act("release",{resourceId:resource.id,reservationId:turn.id})}>Finalizar</button>
            </div>)}
          </div>}
        </article>;
      })}
    </section>
  </div>;
}

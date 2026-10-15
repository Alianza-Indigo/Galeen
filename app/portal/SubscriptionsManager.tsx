"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Subscription={
  id:string;provider:string;product_name:string;label:string;seat_capacity:number;
  seats_used:number;status:string;access_mode:string;created_at:string
};
type Allocation={
  id:string;subscription_id:string;user_id:string;status:string;
  email:string;display_name:string|null;assigned_at:string
};
type User={user_id:string;email:string;display_name:string|null};
type Data={subscriptions:Subscription[];allocations:Allocation[];users:User[];role:string};
type Props={organizationId:string;role:string;onChanged?:()=>void};
const providers=[
  {value:"openai",name:"OpenAI",url:"https://chatgpt.com/"},
  {value:"anthropic",name:"Anthropic",url:"https://claude.ai/"},
  {value:"google",name:"Google",url:"https://gemini.google.com/"},
  {value:"microsoft",name:"Microsoft",url:"https://copilot.microsoft.com/"},
  {value:"other",name:"Otro",url:""}
];
const accessModes=[
  {value:"provider_managed",name:"Administrado en proveedor"},
  {value:"enterprise_sso",name:"SSO del proveedor"},
  {value:"pending_integration",name:"Pendiente de integración"}
];
const initial:Data={subscriptions:[],allocations:[],users:[],role:"member"};
export default function SubscriptionsManager({organizationId,role,onChanged}:Props){
  const [data,setData]=useState<Data>(initial);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [mode,setMode]=useState<"list"|"new">("list");
  const [editing,setEditing]=useState<string|null>(null);
  const [selectedProduct,setSelectedProduct]=useState("openai");
  const [selectedUser,setSelectedUser]=useState<Record<string,string>>({});
  const canManage=["owner","admin"].includes(role);
  const canAllocate=["owner","admin","manager"].includes(role);
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const res=await fetch("/api/institution/subscriptions?organization="+encodeURIComponent(organizationId),{cache:"no-store"});
      const val=await res.json();
      if(!res.ok)throw new Error(val.error||"No se pudieron cargar las licencias.");
      setData({
        subscriptions:val.subscriptions||[],allocations:val.allocations||[],
        users:val.users||[],role:val.role||"member"
      });
    }catch(e){setError(e instanceof Error?e.message:"Error de conexión");}
    finally{setLoading(false);}
  },[organizationId]);
  useEffect(()=>{void load()},[load]);
  async function perform(action:string,options:Record<string,unknown>){
    setBusy(true);setError("");setSuccess("");
    try{
      const response=await fetch("/api/institution/subscriptions",{
        method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
        body:JSON.stringify({action,organizationId,...options})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"No fue posible guardar los cambios.");
      setSuccess("Cambios guardados.");
      setEditing(null);setMode("list");
      await load();
      onChanged?.();
    }catch(e){setError(e instanceof Error?e.message:"Error de conexión");}
    finally{setBusy(false);}
  }
  function add(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);
    void perform("create",{
      provider:String(f.get("provider")),productName:String(f.get("productName")).trim(),
      label:String(f.get("label")).trim(),seatCapacity:Number(f.get("seats")),
      accessMode:String(f.get("access"))
    });
  }
  function update(e:FormEvent<HTMLFormElement>,id:string){
    e.preventDefault();const f=new FormData(e.currentTarget);
    void perform("update",{
      subscriptionId:id,productName:String(f.get("productName")).trim(),
      label:String(f.get("label")).trim(),seatCapacity:Number(f.get("seats")),
      status:String(f.get("status")),accessMode:String(f.get("access"))
    });
  }
  const formatStatus=(status:string)=>status==="active"?"Activa":status==="paused"?"Pausada":"Retirada";
  return <div className="ip-subscriptions">
    <section className="ip-card">
      <div className="ip-sub-heading">
        <h2>Cuentas y licencias ({data.subscriptions.length})</h2>
        {canManage&&<button className="ip-sub-add" onClick={()=>setMode(mode==="new"?"list":"new")} disabled={busy}>
          {mode==="new"?"Cancelar":"+ Agregar"}
        </button>}
      </div>
      <p className="ip-sub-caption">Asigna cupos en GALEEN; las altas y los accesos se gestionan con el proveedor.</p>
      {error&&<div className="ip-feedback ip-error" role="alert">{error}</div>}
      {success&&<div className="ip-feedback ip-success" role="status">{success}</div>}
      {canManage&&mode==="new"&&<form className="ip-sub-form" onSubmit={add}>
        <label>Proveedor
          <select name="provider" value={selectedProduct} onChange={e=>setSelectedProduct(e.target.value)}>
            {providers.map(p=><option key={p.value} value={p.value}>{p.name}</option>)}
          </select>
        </label>
        <label>Producto o plan
          <input name="productName" required minLength={2} maxLength={120} placeholder="Business, Team, Enterprise..." />
        </label>
        <label>Nombre de referencia
          <input name="label" required minLength={2} maxLength={120} placeholder="Licencias del departamento" />
        </label>
        <label>Licencias disponibles
          <input name="seats" type="number" required min="1" max="100000" defaultValue={10}/>
        </label>
        <label>Tipo de acceso
          <select name="access">{accessModes.map(m=><option key={m.value} value={m.value}>{m.name}</option>)}</select>
        </label>
        <div className="ip-sub-actions"><button className="ip-primary" disabled={busy}>Guardar suscripción</button></div>
      </form>}
      {loading&&<div className="ip-empty">Cargando licencias...</div>}
      {!loading&&!data.subscriptions.length&&<div className="ip-empty">No hay cuentas o licencias registradas.</div>}
      {data.subscriptions.map(s=>{
        const members=data.allocations.filter(a=>a.subscription_id===s.id);
        const external=providers.find(p=>p.value===s.provider);
        return <div className="ip-sub-record" key={s.id}>
          <div className="ip-sub-headline">
            <div>
              <b>{s.label}</b><small>{external?.name||"Otro"} · {s.product_name}</small>
            </div>
            <span className={"ip-sub-status "+(s.status==="active"?"ip-sub-active":"")}>{formatStatus(s.status)}</span>
          </div>
          <div className="ip-sub-metrics">
            <span>{s.seats_used} / {s.seat_capacity} asignadas</span>
            <span>{accessModes.find(m=>m.value===s.access_mode)?.name||s.access_mode}</span>
          </div>
          <div className="ip-sub-actions">
            {external?.url&&s.status==="active"&&<a href={external.url} target="_blank" rel="noopener noreferrer">Abrir proveedor ↗</a>}
            {canManage&&<button onClick={()=>setEditing(editing===s.id?null:s.id)} disabled={busy}>
              {editing===s.id?"Cerrar":"Editar"}
            </button>}
          </div>
          {canManage&&editing===s.id&&<form className="ip-sub-form ip-sub-edit" onSubmit={e=>update(e,s.id)}>
            <label>Producto o plan<input name="productName" defaultValue={s.product_name} minLength={2} maxLength={120} required/></label>
            <label>Nombre<input name="label" defaultValue={s.label} minLength={2} maxLength={120} required/></label>
            <label>Número de licencias<input name="seats" type="number" min="1" max="100000" defaultValue={s.seat_capacity} required/></label>
            <label>Estado<select name="status" defaultValue={s.status}>
              <option value="active">Activa</option><option value="paused">Pausada</option><option value="retired">Retirada</option>
            </select></label>
            <label>Tipo de acceso<select name="access" defaultValue={s.access_mode}>
              {accessModes.map(m=><option key={m.value} value={m.value}>{m.name}</option>)}
            </select></label>
            <div className="ip-sub-actions"><button className="ip-primary" disabled={busy}>Guardar cambios</button></div>
          </form>}
          {canAllocate&&<div className="ip-sub-allocations">
            <strong>Asignaciones</strong>
            {members.map(a=><div className="ip-sub-person" key={a.id}>
              <div><b>{a.display_name||a.email}</b><small>{a.email}</small></div>
              <button disabled={busy} onClick={()=>void perform("revoke",{subscriptionId:s.id,allocationId:a.id})}>Revocar</button>
            </div>)}
            {!members.length&&<p>Sin licencias asignadas.</p>}
            {s.status==="active"&&Number(s.seats_used)<s.seat_capacity&&data.users.length>0&&
              <form className="ip-sub-assign" onSubmit={e=>{
                e.preventDefault();
                const userId=selectedUser[s.id]||"";
                if(userId)void perform("assign",{subscriptionId:s.id,userId});
              }}>
                <select aria-label="Seleccionar usuario" value={selectedUser[s.id]||""}
                  onChange={e=>setSelectedUser(v=>({...v,[s.id]:e.target.value}))}>
                  <option value="">Selecciona un usuario</option>
                  {data.users.filter(u=>!members.some(m=>m.user_id===u.user_id)).map(u=>
                    <option key={u.user_id} value={u.user_id}>{u.display_name||u.email}</option>)}
                </select>
                <button disabled={busy||!selectedUser[s.id]}>Asignar licencia</button>
              </form>}
          </div>}
          {!canAllocate&&<div className="ip-sub-owner">Asignada a tu cuenta</div>}
        </div>;
      })}
    </section>
  </div>;
}

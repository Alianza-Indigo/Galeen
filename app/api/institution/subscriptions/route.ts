import { NextRequest } from "next/server";
import { ApiError, reply, respondError, requireSameOrigin, requestJson,
  stringField, uuid, option, numberInt } from "@/lib/http";
import { withInstitution, institutionalRoles } from "@/lib/institution-access";
import { audit } from "@/lib/admin-records";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const providers=["openai","anthropic","google","microsoft","other"] as const;
const statuses=["active","paused","retired"] as const;
const accessModes=["provider_managed","enterprise_sso","pending_integration"] as const;
const managers=["owner","admin"] as const;
const allocators=["owner","admin","manager"] as const;

export async function GET(req:NextRequest) {
  try {
    const organizationId=req.nextUrl.searchParams.get("organization");
    return reply(await withInstitution(req,organizationId,institutionalRoles,async({client,orgId,role,userId})=>{
      const canViewAll=["owner","admin","manager","auditor"].includes(role);
      const subscriptions=await client.query(
        "SELECT s.id,s.provider,s.product_name,s.label,s.seat_capacity,s.status,s.access_mode,s.created_at,"+
        "(SELECT count(*)::int FROM subscription_seat_allocations a "+
        " WHERE a.organization_id=s.organization_id AND a.subscription_id=s.id AND a.status='assigned') AS seats_used "+
        "FROM institutional_subscriptions s WHERE s.organization_id=$1 "+
        (canViewAll?"":"AND EXISTS (SELECT 1 FROM subscription_seat_allocations a WHERE a.organization_id=s.organization_id "+
          "AND a.subscription_id=s.id AND a.user_id=$2 AND a.status='assigned') ")+
        "ORDER BY s.created_at DESC LIMIT 250",
        canViewAll?[orgId]:[orgId,userId]
      );
      const allocations=await client.query(
        "SELECT a.id,a.subscription_id,a.user_id,a.status,a.assigned_at,u.display_name,u.email "+
        "FROM subscription_seat_allocations a JOIN app_users u ON u.id=a.user_id "+
        "WHERE a.organization_id=$1 AND a.status='assigned' "+
        (canViewAll?"":"AND a.user_id=$2 ")+
        "ORDER BY a.assigned_at DESC LIMIT 1000",
        canViewAll?[orgId]:[orgId,userId]
      );
      const users=canViewAll?await client.query(
        "SELECT m.user_id,u.email,u.display_name FROM organization_members m "+
        "JOIN app_users u ON u.id=m.user_id WHERE m.organization_id=$1 "+
        "AND m.status='active' AND u.disabled_at IS NULL "+
        "ORDER BY u.email LIMIT 1000",[orgId]
      ):{rows:[]};
      return {role,subscriptions:subscriptions.rows,allocations:allocations.rows,users:users.rows};
    }));
  } catch(err) {
    return respondError(err);
  }
}

export async function POST(req:NextRequest) {
  try {
    requireSameOrigin(req);
    const data=await requestJson(req);
    const action=option(data.action,["create","update","assign","revoke"] as const,"Acción");
    const org=uuid(data.organizationId);

    if(action==="create") return reply(await withInstitution(req,org,managers,async({client,orgId,userId})=>{
      const provider=option(data.provider,providers,"Proveedor");
      const product=stringField(data.productName,"Producto",2,120);
      const label=stringField(data.label,"Nombre",2,120);
      const seats=numberInt(data.seatCapacity,"Número de licencias",1,100000);
      const access=option(data.accessMode,accessModes,"Modalidad");
      const result=await client.query<{id:string}>(
        "INSERT INTO institutional_subscriptions "+
        "(organization_id,provider,product_name,label,seat_capacity,access_mode,created_by) "+
        "VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [orgId,provider,product,label,seats,access,userId]
      );
      const id=result.rows[0].id;
      await audit(client,orgId,"subscription.created","subscription",id,{provider,seats},userId);
      return {ok:true,id};
    }));

    const id=uuid(data.subscriptionId);
    if(action==="update") return reply(await withInstitution(req,org,managers,async({client,orgId,userId})=>{
      const label=stringField(data.label,"Nombre",2,120);
      const product=stringField(data.productName,"Producto",2,120);
      const seats=numberInt(data.seatCapacity,"Número de licencias",1,100000);
      const status=option(data.status,statuses,"Estado");
      const access=option(data.accessMode,accessModes,"Modalidad");
      const existing=await client.query(
        "SELECT id FROM institutional_subscriptions WHERE organization_id=$1 AND id=$2 FOR UPDATE",
        [orgId,id]
      );
      if(!existing.rows.length)throw new ApiError(404,"Suscripción no encontrada.");
      const assigned=await client.query<{total:number}>(
        "SELECT count(*)::int AS total FROM subscription_seat_allocations "+
        "WHERE organization_id=$1 AND subscription_id=$2 AND status='assigned'",[orgId,id]
      );
      if(Number(assigned.rows[0].total)>seats)throw new ApiError(409,"Ya hay más licencias asignadas que el nuevo límite.");
      await client.query(
        "UPDATE institutional_subscriptions SET label=$3,product_name=$4,seat_capacity=$5,"+
        "status=$6,access_mode=$7,updated_at=now() "+
        "WHERE organization_id=$1 AND id=$2",
        [orgId,id,label,product,seats,status,access]
      );
      await audit(client,orgId,"subscription.updated","subscription",id,{status,seats},userId);
      return {ok:true};
    }));

    if(action==="assign") return reply(await withInstitution(req,org,allocators,async({client,orgId,userId})=>{
      const target=uuid(data.userId);
      const sub=await client.query<{seat_capacity:number;status:string}>(
        "SELECT seat_capacity,status FROM institutional_subscriptions "+
        "WHERE organization_id=$1 AND id=$2 FOR UPDATE",[orgId,id]
      );
      if(!sub.rows.length)throw new ApiError(404,"Suscripción no encontrada.");
      if(sub.rows[0].status!=="active")throw new ApiError(409,"La suscripción no está activa.");
      const person=await client.query(
        "SELECT 1 FROM organization_members m JOIN app_users u ON u.id=m.user_id "+
        "WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active' AND u.disabled_at IS NULL",
        [orgId,target]
      );
      if(!person.rows.length)throw new ApiError(400,"El usuario no tiene acceso activo a la institución.");
      const already=await client.query<{status:string}>(
        "SELECT status FROM subscription_seat_allocations WHERE organization_id=$1 "+
        "AND subscription_id=$2 AND user_id=$3",[orgId,id,target]
      );
      if(already.rows[0]?.status==="assigned")throw new ApiError(409,"Ya tiene una licencia de esta suscripción.");
      const used=await client.query<{total:number}>(
        "SELECT count(*)::int AS total FROM subscription_seat_allocations "+
        "WHERE organization_id=$1 AND subscription_id=$2 AND status='assigned'",[orgId,id]
      );
      if(Number(used.rows[0].total)>=Number(sub.rows[0].seat_capacity))
        throw new ApiError(409,"No hay licencias disponibles.");
      const result=await client.query<{id:string}>(
        "INSERT INTO subscription_seat_allocations "+
        "(organization_id,subscription_id,user_id,status,assigned_by) "+
        "VALUES($1,$2,$3,'assigned',$4) "+
        "ON CONFLICT(organization_id,subscription_id,user_id) DO UPDATE SET "+
        "status='assigned',assigned_at=now(),revoked_at=NULL,assigned_by=EXCLUDED.assigned_by RETURNING id",
        [orgId,id,target,userId]
      );
      await audit(client,orgId,"subscription.seat_assigned","seat_allocation",result.rows[0].id,{},userId);
      return {ok:true};
    }));

    if(action==="revoke") return reply(await withInstitution(req,org,allocators,async({client,orgId,userId})=>{
      const allocationId=uuid(data.allocationId);
      await client.query(
        "SELECT id FROM institutional_subscriptions WHERE organization_id=$1 AND id=$2 FOR UPDATE",
        [orgId,id]
      );
      const result=await client.query(
        "UPDATE subscription_seat_allocations SET status='revoked',revoked_at=now() "+
        "WHERE organization_id=$1 AND subscription_id=$2 AND id=$3 AND status='assigned' RETURNING id",
        [orgId,id,allocationId]
      );
      if(!result.rows.length)throw new ApiError(404,"Licencia no encontrada.");
      await audit(client,orgId,"subscription.seat_revoked","seat_allocation",allocationId,{},userId);
      return {ok:true};
    }));

    throw new ApiError(400,"Acción no admitida.");
  }catch(error){return respondError(error);}
}

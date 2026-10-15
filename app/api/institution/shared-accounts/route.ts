import { NextRequest } from "next/server";
import {
  ApiError, reply, respondError, requireSameOrigin, requestJson,
  stringField, uuid, option, numberInt
} from "@/lib/http";
import { withInstitution, institutionalRoles } from "@/lib/institution-access";
import { audit } from "@/lib/admin-records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const adminRoles = ["owner", "admin"] as const;
const allocatorRoles = ["owner", "admin", "manager"] as const;
const providers = ["openai","anthropic","google","microsoft","other"] as const;
const statuses = ["active","paused","retired"] as const;

export async function GET(req: NextRequest) {
  try {
    return reply(await withInstitution(
      req, req.nextUrl.searchParams.get("organization"), institutionalRoles,
      async ({client,orgId,role,userId}) => {
        const canManage = ["owner","admin","manager","auditor"].includes(role);
        const resources = await client.query(
          "SELECT a.id,a.provider,a.label,a.account_alias,a.max_assignees,a.max_concurrent,"+
          "a.lease_minutes,a.status,a.connection_status,a.pool_key_hint,a.pool_model,a.pool_verified_at,a.created_at,"+
          "(SELECT count(*)::int FROM shared_account_members m WHERE m.organization_id=a.organization_id "+
          "AND m.resource_id=a.id AND m.status='active') AS assignee_count,"+
          "(SELECT count(*)::int FROM shared_account_reservations r WHERE r.organization_id=a.organization_id "+
          "AND r.resource_id=a.id AND r.status='active' AND r.expires_at>now()) AS busy_count "+
          "FROM shared_account_resources a WHERE a.organization_id=$1 "+
          (canManage ? "" : "AND EXISTS (SELECT 1 FROM shared_account_members m "+
             "WHERE m.organization_id=a.organization_id AND m.resource_id=a.id AND m.user_id=$2 AND m.status='active') ")+
          "ORDER BY a.created_at DESC LIMIT 250", canManage?[orgId]:[orgId,userId]
        );
        const assigned = await client.query(
          "SELECT m.id,m.resource_id,m.user_id,m.status,u.email,u.display_name "+
          "FROM shared_account_members m JOIN app_users u ON u.id=m.user_id "+
          "WHERE m.organization_id=$1 AND m.status='active' "+
          (canManage ? "" : "AND m.user_id=$2 ")+
          "ORDER BY m.assigned_at DESC LIMIT 1250", canManage?[orgId]:[orgId,userId]
        );
        const reservations = await client.query(
          "SELECT r.id,r.resource_id,r.user_id,r.created_at,r.expires_at,u.email,u.display_name "+
          "FROM shared_account_reservations r JOIN app_users u ON u.id=r.user_id "+
          "WHERE r.organization_id=$1 AND r.status='active' AND r.expires_at>now() "+
          (canManage ? "" : "AND r.user_id=$2 ")+
          "ORDER BY r.created_at DESC LIMIT 1000", canManage?[orgId]:[orgId,userId]
        );
        const users = canManage ? await client.query(
          "SELECT m.user_id,u.email,u.display_name FROM organization_members m "+
          "JOIN app_users u ON u.id=m.user_id "+
          "WHERE m.organization_id=$1 AND m.status='active' AND u.disabled_at IS NULL "+
          "ORDER BY u.email LIMIT 1000",[orgId]
        ) : {rows:[]};
        return {role,resources:resources.rows,assigned:assigned.rows,
          reservations:reservations.rows,users:users.rows};
      }
    ));
  } catch (error) { return respondError(error); }
}

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const data = await requestJson(req,9000);
    const action = option(data.action,["create","update","assign","revoke","reserve","release"] as const,"Acción");
    const org = uuid(data.organizationId);
    if(action==="create") return reply(await withInstitution(req,org,adminRoles,async({client,orgId,userId})=>{
      const provider=option(data.provider,providers,"Proveedor");
      const label=stringField(data.label,"Nombre",2,120);
      const alias=stringField(data.accountAlias,"Identificador de cuenta",2,120);
      const maxAssignees=numberInt(data.maxAssignees,"Usuarios autorizados",1,1000);
      const maxConcurrent=numberInt(data.maxConcurrent,"Turnos simultáneos",1,50);
      const leaseMinutes=numberInt(data.leaseMinutes,"Minutos por turno",5,120);
      if(maxConcurrent>maxAssignees)throw new ApiError(400,"Los turnos superan los usuarios autorizados.");
      const {rows}=await client.query<{id:string}>(
        "INSERT INTO shared_account_resources "+
        "(organization_id,provider,label,account_alias,max_assignees,max_concurrent,lease_minutes,created_by) "+
        "VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        [orgId,provider,label,alias,maxAssignees,maxConcurrent,leaseMinutes,userId]
      );
      await audit(client,orgId,"shared_account.created","shared_account",rows[0].id,{provider},userId);
      return {ok:true,id:rows[0].id};
    }));

    const id=uuid(data.resourceId);
    if(action==="update")return reply(await withInstitution(req,org,adminRoles,async({client,orgId,userId})=>{
      const label=stringField(data.label,"Nombre",2,120);
      const alias=stringField(data.accountAlias,"Identificador de cuenta",2,120);
      const maxAssignees=numberInt(data.maxAssignees,"Usuarios autorizados",1,1000);
      const maxConcurrent=numberInt(data.maxConcurrent,"Turnos simultáneos",1,50);
      const leaseMinutes=numberInt(data.leaseMinutes,"Minutos por turno",5,120);
      const status=option(data.status,statuses,"Estado");
      if(maxConcurrent>maxAssignees)throw new ApiError(400,"Los turnos superan los usuarios autorizados.");
      const existing=await client.query(
        "SELECT id FROM shared_account_resources WHERE organization_id=$1 AND id=$2 FOR UPDATE",[orgId,id]);
      if(!existing.rows.length)throw new ApiError(404,"Cuenta no encontrada.");
      const count=await client.query<{n:number}>(
        "SELECT count(*)::int AS n FROM shared_account_members WHERE organization_id=$1 "+
        "AND resource_id=$2 AND status='active'",[orgId,id]);
      if(count.rows[0].n>maxAssignees)throw new ApiError(409,"Reduce las asignaciones antes de disminuir el cupo.");
      const busy=await client.query<{n:number}>(
        "SELECT count(*)::int AS n FROM shared_account_reservations WHERE organization_id=$1 "+
        "AND resource_id=$2 AND status='active' AND expires_at>now()",[orgId,id]);
      if(status==="active"&&busy.rows[0].n>maxConcurrent)
        throw new ApiError(409,"Hay más turnos ocupados que el nuevo límite.");
      await client.query(
        "UPDATE shared_account_resources SET label=$3,account_alias=$4,max_assignees=$5,"+
        "max_concurrent=$6,lease_minutes=$7,status=$8,updated_at=now() "+
        "WHERE organization_id=$1 AND id=$2",
        [orgId,id,label,alias,maxAssignees,maxConcurrent,leaseMinutes,status]
      );
      if(status!=="active")await client.query(
        "UPDATE shared_account_reservations SET status='released',ended_at=now() "+
        "WHERE organization_id=$1 AND resource_id=$2 AND status='active'",[orgId,id]);
      await audit(client,orgId,"shared_account.updated","shared_account",id,{status},userId);
      return {ok:true};
    }));

    if(action==="assign")return reply(await withInstitution(req,org,allocatorRoles,async({client,orgId,userId})=>{
      const target=uuid(data.userId);
      const account=await client.query<{max_assignees:number;status:string}>(
        "SELECT max_assignees,status FROM shared_account_resources "+
        "WHERE organization_id=$1 AND id=$2 FOR UPDATE",[orgId,id]);
      if(!account.rows.length)throw new ApiError(404,"Cuenta no encontrada.");
      if(account.rows[0].status==="retired")throw new ApiError(409,"La cuenta está retirada.");
      const membership=await client.query(
        "SELECT 1 FROM organization_members m JOIN app_users u ON u.id=m.user_id "+
        "WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active' AND u.disabled_at IS NULL",
        [orgId,target]);
      if(!membership.rows.length)throw new ApiError(400,"El usuario no pertenece a la institución.");
      const current=await client.query<{status:string}>(
        "SELECT status FROM shared_account_members WHERE organization_id=$1 AND resource_id=$2 AND user_id=$3",
        [orgId,id,target]);
      if(current.rows[0]?.status==="active")throw new ApiError(409,"El usuario ya tiene acceso.");
      const used=await client.query<{n:number}>(
        "SELECT count(*)::int AS n FROM shared_account_members "+
        "WHERE organization_id=$1 AND resource_id=$2 AND status='active'",[orgId,id]);
      if(used.rows[0].n>=account.rows[0].max_assignees)throw new ApiError(409,"No quedan cupos.");
      const saved=await client.query<{id:string}>(
        "INSERT INTO shared_account_members (organization_id,resource_id,user_id,assigned_by) "+
        "VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,resource_id,user_id) "+
        "DO UPDATE SET status='active',assigned_by=EXCLUDED.assigned_by,assigned_at=now(),revoked_at=NULL RETURNING id",
        [orgId,id,target,userId]);
      await audit(client,orgId,"shared_account.assigned","shared_account_member",saved.rows[0].id,{},userId);
      return {ok:true};
    }));

    if(action==="revoke")return reply(await withInstitution(req,org,allocatorRoles,async({client,orgId,userId})=>{
      const target=uuid(data.userId);
      const account=await client.query(
        "SELECT id FROM shared_account_resources WHERE organization_id=$1 AND id=$2 FOR UPDATE",[orgId,id]);
      if(!account.rows.length)throw new ApiError(404,"Cuenta no encontrada.");
      const changed=await client.query<{id:string}>(
        "UPDATE shared_account_members SET status='revoked',revoked_at=now() "+
        "WHERE organization_id=$1 AND resource_id=$2 AND user_id=$3 AND status='active' RETURNING id",
        [orgId,id,target]);
      if(!changed.rows.length)throw new ApiError(404,"Asignación no encontrada.");
      await client.query(
        "UPDATE shared_account_reservations SET status='released',ended_at=now() "+
        "WHERE organization_id=$1 AND resource_id=$2 AND user_id=$3 AND status='active'",
        [orgId,id,target]);
      await audit(client,orgId,"shared_account.revoked","shared_account_member",changed.rows[0].id,{},userId);
      return {ok:true};
    }));

    if(action==="reserve")return reply(await withInstitution(req,org,institutionalRoles,async({client,orgId,userId})=>{
      const account=await client.query<{max_concurrent:number;lease_minutes:number;status:string}>(
        "SELECT max_concurrent,lease_minutes,status FROM shared_account_resources "+
        "WHERE organization_id=$1 AND id=$2 FOR UPDATE",[orgId,id]);
      if(!account.rows.length)throw new ApiError(404,"Cuenta no encontrada.");
      if(account.rows[0].status!=="active")throw new ApiError(409,"La cuenta no acepta turnos.");
      const allowed=await client.query(
        "SELECT 1 FROM shared_account_members WHERE organization_id=$1 AND resource_id=$2 "+
        "AND user_id=$3 AND status='active'",[orgId,id,userId]);
      if(!allowed.rows.length)throw new ApiError(403,"No tienes asignación para esta cuenta.");
      await client.query(
        "UPDATE shared_account_reservations SET status='expired',ended_at=now() "+
        "WHERE organization_id=$1 AND resource_id=$2 AND status='active' AND expires_at<=now()",
        [orgId,id]);
      const existing=await client.query<{id:string;expires_at:string}>(
        "SELECT id,expires_at FROM shared_account_reservations "+
        "WHERE organization_id=$1 AND resource_id=$2 AND user_id=$3 AND status='active' "+
        "AND expires_at>now() LIMIT 1",[orgId,id,userId]);
      if(existing.rows.length)return {ok:true,reservation:existing.rows[0],existing:true};
      const busy=await client.query<{n:number}>(
        "SELECT count(*)::int AS n FROM shared_account_reservations "+
        "WHERE organization_id=$1 AND resource_id=$2 AND status='active' AND expires_at>now()",[orgId,id]);
      if(busy.rows[0].n>=account.rows[0].max_concurrent)
        throw new ApiError(409,"Todos los turnos están ocupados.");
      const created=await client.query<{id:string;expires_at:string}>(
        "INSERT INTO shared_account_reservations(organization_id,resource_id,user_id,expires_at) "+
        "VALUES($1,$2,$3,now()+($4::int*interval '1 minute')) RETURNING id,expires_at",
        [orgId,id,userId,account.rows[0].lease_minutes]);
      await audit(client,orgId,"shared_account.turn_started","shared_account_reservation",created.rows[0].id,{},userId);
      return {ok:true,reservation:created.rows[0],existing:false};
    }));

    if(action==="release")return reply(await withInstitution(req,org,institutionalRoles,async({client,orgId,userId,role})=>{
      const reservationId=uuid(data.reservationId);
      const account=await client.query(
        "SELECT id FROM shared_account_resources WHERE organization_id=$1 AND id=$2 FOR UPDATE",[orgId,id]);
      if(!account.rows.length)throw new ApiError(404,"Cuenta no encontrada.");
      const current=await client.query<{user_id:string}>(
        "SELECT user_id FROM shared_account_reservations WHERE organization_id=$1 "+
        "AND resource_id=$2 AND id=$3 AND status='active'",[orgId,id,reservationId]);
      if(!current.rows.length)throw new ApiError(404,"Turno no encontrado.");
      if(current.rows[0].user_id!==userId&&!["owner","admin","manager"].includes(role))
        throw new ApiError(403,"No puedes liberar otro turno.");
      const updated=await client.query(
        "UPDATE shared_account_reservations SET status='released',ended_at=now() "+
        "WHERE organization_id=$1 AND resource_id=$2 AND id=$3 AND status='active'",
        [orgId,id,reservationId]);
      if(!updated.rowCount)throw new ApiError(404,"Turno no encontrado.");
      await audit(client,orgId,"shared_account.turn_released","shared_account_reservation",reservationId,{},userId);
      return {ok:true};
    }));
    throw new ApiError(400,"Acción no válida.");
  } catch (error) { return respondError(error); }
}

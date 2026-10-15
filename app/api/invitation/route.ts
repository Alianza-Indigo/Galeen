import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { transaction, one } from "@/lib/db";
import { ApiError, reply, respondError, requestJson, requireSameOrigin,
  stringField, emailField } from "@/lib/http";
import { checkLoginLimit, failedLogin, passedLogin } from "@/lib/login-throttle";
import { verifyPasswordStrength, hashPassword } from "@/lib/passwords";
import { MEMBER_COOKIE, MEMBER_SESSION_AGE, newMemberSession, readMemberSession } from "@/lib/tenant-session";
import { audit } from "@/lib/admin-records";
export const runtime="nodejs";
export const dynamic="force-dynamic";

function tokenHash(value:string) {
  if(typeof value!=="string" || !/^[A-Za-z0-9_-]{40,100}$/.test(value)) {
    throw new ApiError(400,"Invitación inválida.");
  }
  return createHash("sha256").update(value).digest("hex");
}
export async function GET(req:NextRequest) {
  try {
    const hash=tokenHash(req.nextUrl.searchParams.get("token")||"");
    const invite=await one<{
      id:string;email:string;role:string;organization_id:string;organization_name:string;
      expires_at:string;accepted_at:string|null;revoked_at:string|null
    }>(
      "SELECT i.id,i.email,i.role,i.organization_id,i.expires_at,i.accepted_at,i.revoked_at,o.name AS organization_name "+
      "FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id "+
      "WHERE i.token_hash=$1 AND i.expires_at>now() AND o.status='active'",[hash]);
    if(!invite||invite.accepted_at||invite.revoked_at)throw new ApiError(404,"La invitación no está disponible.");
    return reply({email:invite.email,role:invite.role,organizationName:invite.organization_name});
  }catch(error){return respondError(error);}
}
export async function POST(req:NextRequest) {
  let throttleKey: string | null = null;
  try {
    requireSameOrigin(req);
    const input=await requestJson(req,6000);
    const hash=tokenHash(String(input.token||""));
    const name=stringField(input.name,"Nombre",2,180);
    const password=typeof input.password==="string"?input.password:"";
    const currentId=readMemberSession(req.cookies.get(MEMBER_COOKIE)?.value);
    throttleKey=await checkLoginLimit("invitation:"+hash);
    let sessionId:string|null=null;
    const outcome=await transaction(async client=>{
      const res=await client.query(
        "SELECT i.*,o.status AS organization_status FROM organization_invitations i "+
        "JOIN organizations o ON o.id=i.organization_id WHERE token_hash=$1 FOR UPDATE OF i",[hash]);
      const invitation=res.rows[0] as {
        id:string;organization_id:string;email:string;role:string;expires_at:string;
        accepted_at:string|null;revoked_at:string|null;organization_status:string
      }|undefined;
      if(!invitation||invitation.accepted_at||invitation.revoked_at||
        new Date(invitation.expires_at).getTime()<=Date.now()||
        invitation.organization_status!=="active")throw new ApiError(400,"Invitación vencida o revocada.");
      const cap=await client.query(
        "SELECT max_users FROM organization_entitlements WHERE organization_id=$1 FOR UPDATE",
        [invitation.organization_id]);
      const existing=await client.query(
        "SELECT id,password_hash,disabled_at FROM app_users WHERE lower(email)=$1 FOR UPDATE",
        [invitation.email]);
      let userId:string;
      if(existing.rows.length) {
        const user=existing.rows[0] as {id:string;password_hash:string|null;disabled_at:string|null};
        if(user.disabled_at)throw new ApiError(403,"Cuenta deshabilitada.");
        if(!currentId || currentId!==user.id)throw new ApiError(401,
          "Este correo ya tiene cuenta. Inicie sesión para aceptar la invitación.");
        userId=user.id;
      }else{
        let validated:string;
        try{validated=verifyPasswordStrength(password);}
        catch(e){throw new ApiError(400,(e as Error).message);}
        const hashed=await hashPassword(validated);
        const created=await client.query(
          "INSERT INTO app_users(email,display_name,password_hash) VALUES($1,$2,$3) RETURNING id",
          [emailField(invitation.email),name,hashed]);
        userId=created.rows[0].id;
      }
      const already=await client.query(
        "SELECT status FROM organization_members WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",
        [invitation.organization_id,userId]);
      if(already.rows[0]?.status==="active")throw new ApiError(409,"Ya pertenece a esta institución.");
      const members=await client.query(
        "SELECT count(*)::int AS n FROM organization_members WHERE organization_id=$1 AND status='active'",
        [invitation.organization_id]);
      if(Number(members.rows[0].n)>=Number(cap.rows[0]?.max_users||0))
        throw new ApiError(409,"La institución alcanzó su límite de usuarios.");
      await client.query(
        "INSERT INTO organization_members(organization_id,user_id,role,status) "+
        "VALUES($1,$2,$3,'active') "+
        "ON CONFLICT(organization_id,user_id) DO UPDATE SET role=EXCLUDED.role,status='active'",
        [invitation.organization_id,userId,invitation.role]
      );
      await client.query("UPDATE organization_invitations SET accepted_at=now() WHERE id=$1",[invitation.id]);
      await audit(client,invitation.organization_id,"member.accepted","member",userId,
        {role:invitation.role});
      return userId;
    });
    sessionId=outcome;
    await passedLogin(throttleKey);
    const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set(MEMBER_COOKIE,newMemberSession(sessionId),{
      httpOnly:true,secure:process.env.NODE_ENV==="production",
      sameSite:"strict",maxAge:MEMBER_SESSION_AGE,path:"/"
    });
    return response;
  }catch(error){
    if (throttleKey && error instanceof ApiError && [400,401,403].includes(error.status)) {
      try { await failedLogin(throttleKey); } catch {}
    }
    return respondError(error);
  }
}

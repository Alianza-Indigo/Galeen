import { NextRequest, NextResponse } from "next/server";
import { one } from "@/lib/db";
import { ApiError, requestJson, requireSameOrigin, reply, respondError } from "@/lib/http";
import { checkLoginLimit, failedLogin, passedLogin } from "@/lib/login-throttle";
import { checkPassword } from "@/lib/passwords";
import { MEMBER_COOKIE, MEMBER_SESSION_AGE, newMemberSession } from "@/lib/tenant-session";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(req:NextRequest) {
  try {
    requireSameOrigin(req);
    const data=await requestJson(req,4096);
    const email=String(data.email||"").trim().toLowerCase();
    const password=String(data.password||"");
    if(email.length>254||password.length>256)throw new ApiError(400,"Datos inválidos.");
    const key=await checkLoginLimit("member:"+email);
    const person=await one<{id:string;password_hash:string|null;disabled_at:string|null}>(
      "SELECT id,password_hash,disabled_at FROM app_users WHERE lower(email)=$1",[email]);
    if(!person || person.disabled_at || !await checkPassword(password,person.password_hash)) {
      await failedLogin(key);
      throw new ApiError(401,"Credenciales incorrectas.");
    }
    await passedLogin(key);
    const res=NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
    res.cookies.set(MEMBER_COOKIE,newMemberSession(person.id),{
      httpOnly:true,secure:process.env.NODE_ENV==="production",
      sameSite:"strict",maxAge:MEMBER_SESSION_AGE,path:"/"
    });
    return res;
  } catch(error){return respondError(error);}
}

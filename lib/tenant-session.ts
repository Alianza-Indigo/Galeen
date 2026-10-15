import { createHmac, timingSafeEqual } from "node:crypto";

export const MEMBER_COOKIE = "galeen_member";
export const MEMBER_SESSION_AGE = 12 * 3600;

function mac(text: string) {
  const key = process.env.AUTH_SECRET;
  if (!key || key.length < 32) throw new Error("AUTH_SECRET is not configured");
  return createHmac("sha256",key).update("member:").update(text).digest("base64url");
}
export function newMemberSession(userId: string) {
  const now = Math.floor(Date.now()/1000);
  const body = Buffer.from(JSON.stringify({sub:userId,v:1,iat:now,exp:now+MEMBER_SESSION_AGE}),"utf8").toString("base64url");
  return body+"."+mac(body);
}
export function readMemberSession(token?: string): string | null {
  if(!token || token.length>1500) return null;
  const [body,signature,extra] = token.split(".");
  if(!body||!signature||extra) return null;
  const calculated = mac(body);
  const a=Buffer.from(signature),b=Buffer.from(calculated);
  if(a.length!==b.length || !timingSafeEqual(a,b))return null;
  try {
    const o=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
    const now=Math.floor(Date.now()/1000);
    if(o.v!==1 || typeof o.sub!=="string" || !/^[0-9a-f-]{36}$/.test(o.sub) ||
       !Number.isInteger(o.iat)||!Number.isInteger(o.exp)||o.iat>now||
       o.exp<=now || o.exp-o.iat>MEMBER_SESSION_AGE)return null;
    return o.sub;
  }catch{return null;}
}

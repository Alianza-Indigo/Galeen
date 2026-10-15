import { createHmac } from "node:crypto";
import { rows } from "@/lib/db";
import { ApiError } from "@/lib/http";

const WINDOW_SECONDS = 900;
const MAX_FAILURES = 8;
function keyFor(key: string) {
  const secret=process.env.AUTH_SECRET;
  if(!secret || secret.length<32)throw new ApiError(503,"Servicio de autenticación no configurado.");
  return createHmac("sha256",secret).update("throttle:"+key).digest("hex");
}
export async function checkLoginLimit(identity: string) {
  const key=keyFor(identity.toLowerCase());
  const check=await rows<{failures:number;blocked:boolean}>(
    "SELECT failures,(locked_until IS NOT NULL AND locked_until>now()) AS blocked FROM auth_login_throttle WHERE key_hash=$1",
    [key]
  );
  if(check[0]?.blocked)throw new ApiError(429,"Demasiados intentos. Vuelva a intentarlo en 15 minutos.");
  return key;
}
export async function failedLogin(hash: string) {
  await rows(
    "INSERT INTO auth_login_throttle(key_hash,failures,window_started,locked_until,updated_at) VALUES($1,1,now(),NULL,now()) "+
    "ON CONFLICT(key_hash) DO UPDATE SET "+
    "failures=CASE WHEN auth_login_throttle.window_started<now()-interval '15 minutes' THEN 1 ELSE auth_login_throttle.failures+1 END,"+
    "window_started=CASE WHEN auth_login_throttle.window_started<now()-interval '15 minutes' THEN now() ELSE auth_login_throttle.window_started END,"+
    "locked_until=CASE WHEN auth_login_throttle.window_started<now()-interval '15 minutes' THEN NULL "+
    "WHEN auth_login_throttle.failures+1>=$2 THEN now()+interval '15 minutes' ELSE auth_login_throttle.locked_until END,"+
    "updated_at=now()",[hash,MAX_FAILURES]
  );
}
export async function passedLogin(hash:string) {
  await rows("DELETE FROM auth_login_throttle WHERE key_hash=$1",[hash]);
}
export const WINDOW_DURATION = WINDOW_SECONDS;

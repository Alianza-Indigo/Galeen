import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export function verifyPasswordStrength(value: unknown): string {
  if(typeof value!=="string" || value.length<12 || value.length>256 ||
     !/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    throw new Error("La contraseña requiere al menos 12 caracteres, letras y números.");
  }
  return value;
}
export async function hashPassword(value: string) {
  const salt=randomBytes(16).toString("hex");
  const key=(await scrypt(value,salt,64)) as Buffer;
  return "scrypt$"+salt+"$"+key.toString("hex");
}
export async function checkPassword(value: string, hash: string | null) {
  if(!hash || typeof value!=="string" || value.length>256)return false;
  const [kind,salt,stored,extra]=hash.split("$");
  if(kind!=="scrypt"||!salt||!stored||extra || !/^[0-9a-f]{32}$/.test(salt) ||
    !/^[0-9a-f]{128}$/.test(stored))return false;
  const key=(await scrypt(value,salt,64)) as Buffer;
  const expected=Buffer.from(stored,"hex");
  return timingSafeEqual(key,expected);
}

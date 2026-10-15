import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ApiError } from "@/lib/http";

/**
 * GALEEN_ENCRYPTION_KEY is a 32-byte master key, encoded as 64 hex chars
 * (preferred) or base64. It must be configured server-side in Vercel.
 */
function loadMasterKey(): Buffer {
  const value = process.env.GALEEN_ENCRYPTION_KEY?.trim() ?? "";
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value,"hex");
  if (/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    const bytes=Buffer.from(value,"base64");
    if (bytes.length===32 && bytes.toString("base64")===value) return bytes;
  }
  throw new ApiError(503,"El cifrado de conexiones no está configurado.");
}

function associatedData(orgId:string,connectionId:string,version:number) {
  return Buffer.from("GALEEN:provider:"+version+":"+orgId+":"+connectionId,"utf8");
}
export function encryptCredential(orgId:string,connectionId:string,secret:string) {
  if (typeof secret!=="string" || secret.length<12 || secret.length>4096 ||
      /[\r\n\0]/.test(secret) || secret.trim()!==secret) {
    throw new ApiError(400,"La clave debe tener entre 12 y 4096 caracteres sin espacios externos.");
  }
  const key=loadMasterKey();
  const nonce=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key,nonce);
  cipher.setAAD(associatedData(orgId,connectionId,1));
  const contents=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
  const encrypted=Buffer.concat([contents,cipher.getAuthTag()]);
  return { encrypted, nonce, version:1, hint:"••••"+secret.slice(-4) };
}

export function decryptCredential(
  orgId:string, connectionId:string, encrypted:Buffer, nonce:Buffer, version:number
):string {
  if(version!==1 || nonce.length!==12 || encrypted.length<17) {
    throw new ApiError(409,"Esta conexión requiere renovar las credenciales.");
  }
  try {
    const key=loadMasterKey();
    const decipher=createDecipheriv("aes-256-gcm",key,nonce);
    decipher.setAAD(associatedData(orgId,connectionId,version));
    decipher.setAuthTag(encrypted.subarray(encrypted.length-16));
    const value=Buffer.concat([
      decipher.update(encrypted.subarray(0,-16)),decipher.final()
    ]);
    return value.toString("utf8");
  } catch(error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(409,"No se pudo descifrar la conexión. Renueva sus credenciales.");
  }
}

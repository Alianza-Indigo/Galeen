import { ApiError } from "@/lib/http";

function baseUrl() {
  const value=process.env.GALEEN_POOL_ORIGIN?.trim();
  if(!value)throw new ApiError(503,"El motor de cuentas compartidas no está configurado.");
  let parsed:URL;
  try{parsed=new URL(value);}catch{throw new ApiError(503,"Origen de ElizaOS inválido.");}
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.search||parsed.hash||
    (parsed.pathname!=="/"&&parsed.pathname!=="")||!parsed.hostname.includes(".")||
    parsed.port||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(parsed.hostname))
    throw new ApiError(503,"Origen de ElizaOS inválido.");
  return parsed.origin;
}
async function request(path:string,key:string,body?:object){
  const url=baseUrl()+path;
  try{
    const response=await fetch(url,{
      method:body?"POST":"GET",
      headers:{"x-api-key":key,"accept":"application/json",...(body?{"content-type":"application/json"}:{})},
      body:body?JSON.stringify(body):undefined,
      cache:"no-store",redirect:"error",signal:AbortSignal.timeout(body?40000:9000)
    });
    const text=await response.text();
    if(text.length>350000)throw new ApiError(502,"Respuesta demasiado grande del motor.");
    let parsed:unknown;
    try{parsed=JSON.parse(text);}catch{
      throw new ApiError(502,"Respuesta no válida del motor.");
    }
    if(!response.ok){
      if([401,403].includes(response.status))throw new ApiError(401,"La credencial del motor no es válida.");
      if(response.status===429)throw new ApiError(429,"La cuenta compartida alcanzó su límite.");
      throw new ApiError(502,"El motor no pudo procesar la solicitud.");
    }
    return parsed;
  }catch(error){
    if(error instanceof ApiError)throw error;
    throw new ApiError(502,"No fue posible contactar el motor ElizaOS.");
  }
}
type Verification={ok:boolean};
export async function verifyPoolKey(key:string):Promise<Verification>{
  const response=await request("/meter/me",key);
  if(!response||typeof response!=="object")throw new ApiError(502,"El motor devolvió información inválida.");
  return {ok:true};
}

export async function inferThroughPool(
  provider:"openai"|"anthropic",model:string,prompt:string,key:string
):Promise<{text:string;inputTokens:number|null;outputTokens:number|null}>{
  let response:unknown;
  if(provider==="anthropic"){
    response=await request("/v1/messages",key,{
      model,max_tokens:800,stream:false,messages:[{role:"user",content:prompt}]
    });
  }else{
    response=await request("/openai/v1/responses",key,{
      model,stream:false,store:false,input:[{role:"user",content:[{type:"input_text",text:prompt}]}]
    });
  }
  if(!response||typeof response!=="object")throw new ApiError(502,"Respuesta inválida del proveedor.");
  const r=response as Record<string,unknown>;
  let chunks:string[]=[];
  if(provider==="anthropic"&&Array.isArray(r.content)){
    chunks=r.content.filter((c):c is {type:string;text:string}=>!!c&&typeof c==="object"&&
      (c as {type?:unknown}).type==="text"&&typeof (c as {text?:unknown}).text==="string").map(c=>c.text);
  }else if(provider==="openai"&&Array.isArray(r.output)){
    for(const item of r.output){
      if(!item||typeof item!=="object")continue;
      const blocks=(item as {content?:unknown}).content;
      if(!Array.isArray(blocks))continue;
      for(const part of blocks){
        if(part&&typeof part==="object"&&
          ["output_text","text"].includes(String((part as {type?:unknown}).type))&&
          typeof (part as {text?:unknown}).text==="string") chunks.push((part as {text:string}).text);
      }
    }
  }
  const text=chunks.join("\n").trim();
  if(!text)throw new ApiError(502,"El proveedor no devolvió una respuesta de texto.");
  const usage=(r.usage&&typeof r.usage==="object"?r.usage:{}) as Record<string,unknown>;
  const numeric=(x:unknown)=>typeof x==="number"&&Number.isFinite(x)&&x>=0?Math.floor(x):null;
  return {
    text:text.slice(0,40000),
    inputTokens:numeric(usage.input_tokens),
    outputTokens:numeric(usage.output_tokens)
  };
}

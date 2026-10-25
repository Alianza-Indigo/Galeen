#!/usr/bin/env node
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {join,dirname} from "node:path";
import {homedir,hostname} from "node:os";
import {createInterface} from "node:readline/promises";

const root=process.env.GALEEN_BROWSER_DIR||join(homedir(),".galeen","browser");
const configFile=join(root,"school.json");
const providerUrl={openai:"https://chatgpt.com/",anthropic:"https://claude.ai/new"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const origin=u=>{const v=new URL(u);if(v.protocol!=="https:"&&!(v.protocol==="http:"&&["localhost","127.0.0.1"].includes(v.hostname)))throw Error("GALEEN_URL debe usar HTTPS.");return v.origin;};
async function readConfig(){return JSON.parse(await readFile(configFile,"utf8"));}
async function call(c,action,extra={}){
 const response=await fetch(origin(c.url)+"/api/institution/local-broker",{
  method:"POST",headers:{"content-type":"application/json",...(c.token?{"authorization":"Bearer "+c.token}:{})},
  body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(25000)
 });
 const data=await response.json();
 if(!response.ok)throw Error(data.error||"Error HTTP "+response.status);
 return data;
}
async function launch(c){return chromium.launchPersistentContext(join(root,"profile-"+c.provider),{
 headless:false,viewport:{width:1280,height:900},acceptDownloads:false
});}
async function login(c){
 const ctx=await launch(c);
 try{
  const page=ctx.pages()[0]||await ctx.newPage();
  await page.goto(providerUrl[c.provider],{waitUntil:"domcontentloaded"});
  console.log("Inicia sesión en la ventana abierta usando la cuenta de la escuela.");
  const rl=createInterface({input:process.stdin,output:process.stdout});
  await rl.question("Una vez visible el chat, presiona Enter aquí: ");
  rl.close();
 }finally{await ctx.close();}
}
function firstVisible(page,selectors){
 return (async()=>{
  for(const selector of selectors){
   const loc=page.locator(selector).last();
   if(await loc.count() && await loc.isVisible().catch(()=>false))return loc;
  }
  return null;
 })();
}
async function execute(ctx,provider,prompt){
 const page=await ctx.newPage();
 try{
  await page.goto(providerUrl[provider],{waitUntil:"domcontentloaded",timeout:45000});
  const inputs=provider==="openai"
   ?["#prompt-textarea[contenteditable=true]","#prompt-textarea","[data-testid='composer-text-input']"]
   :["[contenteditable=true].ProseMirror","[data-testid='chat-input'] [contenteditable=true]","[contenteditable=true][role=textbox]"];
  let input;
  for(let i=0;i<40;i++){input=await firstVisible(page,inputs);if(input)break;await sleep(750);}
  if(!input)throw Error("No se encontró el cuadro de mensajes. Comprueba que la cuenta esté conectada.");
  await input.click();
  await input.fill(prompt);
  const send=await firstVisible(page,provider==="openai"
   ?["button[data-testid='send-button']","button[aria-label='Enviar mensaje']","button[aria-label='Send prompt']"]
   :["button[aria-label='Send Message']","button[aria-label='Send message']","button[data-testid='send-button']"]);
  if(send)await send.click();else await input.press("Enter");
  const answers=provider==="openai"
   ?["[data-message-author-role='assistant'] .markdown","[data-message-author-role='assistant']"]
   :["[data-testid='assistant-message']",".font-claude-response","[data-is-streaming='false'] .prose"];
  const stop=provider==="openai"
   ?["button[data-testid='stop-button']","button[aria-label='Stop streaming']"]
   :["button[aria-label='Stop response']","button[aria-label='Stop generating']"];
  let last="",stable=0;
  const deadline=Date.now()+165000;
  while(Date.now()<deadline){
   const answer=await firstVisible(page,answers);
   const value=answer?(await answer.innerText().catch(()=>"")).trim():"";
   const busy=Boolean(await firstVisible(page,stop));
   if(value && !busy && value===last)stable++;else stable=0;
   if(value && stable>=3)return value.slice(0,55000);
   last=value;
   await sleep(1300);
  }
  throw Error("No se recibió una respuesta completa antes del tiempo límite.");
 }finally{await page.close();}
}
async function start(c,once=false){
 const limit=Math.max(1,Math.min(50,Number(process.env.GALEEN_BROWSER_CONCURRENCY||1)));
 const ctx=await launch(c);
 const running=new Set();
 let stopped=false;
 process.on("SIGINT",()=>{stopped=true;});
 process.on("SIGTERM",()=>{stopped=true;});
 try{
  while(!stopped){
   try{
    const data=await call(c,"agent.claim",{limit:limit-running.size});
    for(const job of data.jobs||[]){
     const task=(async()=>{
      const timer=setInterval(()=>{void call(c,"agent.heartbeat",{jobId:job.jobId,runId:job.runId}).catch(e=>console.error("Heartbeat:",e.message));},30000);
      try{
       const output=await execute(ctx,c.provider,job.prompt);
       await call(c,"agent.finish",{jobId:job.jobId,runId:job.runId,ok:true,output});
      }catch(e){
       console.error("Trabajo",job.jobId,":",e.message);
       await call(c,"agent.finish",{jobId:job.jobId,runId:job.runId,ok:false,error:String(e.message).slice(0,500)}).catch(()=>{});
      }finally{clearInterval(timer);}
     })();
     running.add(task);void task.finally(()=>running.delete(task));
    }
    if(once){await Promise.allSettled([...running]);break;}
    await call(c,"agent.heartbeat");
    await sleep(running.size?1200:3500);
   }catch(e){
    if(/revocado|autorizado|inválido/i.test(e.message))throw e;
    console.error("Broker temporalmente inaccesible:",e.message);
    if(once)throw e;
    await sleep(5000);
   }
  }
  await Promise.allSettled([...running]);
 }finally{await ctx.close();}
}
const cmd=process.argv[2]||"help";
try{
 if(cmd==="pair"){
  const url=origin(process.env.GALEEN_URL||"");
  const code=process.env.GALEEN_PAIRING_CODE;
  if(!code)throw Error("Define GALEEN_PAIRING_CODE.");
  const result=await call({url},"agent.pair",{code,kind:"browser",name:hostname()+"-browser"});
  await mkdir(root,{recursive:true,mode:0o700});
  await writeFile(configFile,JSON.stringify({url,token:result.token,provider:result.provider}),{mode:0o600});
  console.log("Cuenta institucional vinculada:",result.provider);
 }else if(cmd==="login"||cmd==="start"||cmd==="once"){
  const config=await readConfig();
  if(!providerUrl[config.provider])throw Error("Este conector requiere un recurso ChatGPT o Claude.");
  if(cmd==="login")await login(config);else await start(config,cmd==="once");
 }else console.log("Uso: node worker.mjs pair | login | start | once");
}catch(e){console.error(e.message);process.exitCode=1;}

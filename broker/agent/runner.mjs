#!/usr/bin/env node
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {readFile,writeFile,mkdir,mkdtemp,rm} from "node:fs/promises";
import {join,dirname} from "node:path";
import {hostname,homedir,tmpdir} from "node:os";
import {parseCodex,parseClaude} from "./parse.mjs";
const file=process.env.GALEEN_AGENT_FILE||join(homedir(),".galeen","broker-agent.json");
const cmd=process.argv[2]||"help";
const url=(process.env.GALEEN_URL||"").replace(/\/$/,"");
function origin(u){const x=new URL(u);if(x.protocol!=="https:"&&!(x.protocol==="http:"&&["localhost","127.0.0.1"].includes(x.hostname)))throw Error("GALEEN_URL requiere HTTPS.");return x.origin}
async function request(config,action,extra={}){const r=await fetch(origin(config.url)+"/api/institution/local-broker",{method:"POST",headers:{"content-type":"application/json",...(config.token?{authorization:"Bearer "+config.token}:{})},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(25000)});const data=await r.json();if(!r.ok)throw Error(data.error||"Error del broker");return data}
async function config(){return JSON.parse(await readFile(file,"utf8"))}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function envForCli(){const env={};for(const k of ["PATH","HOME","USER","LOGNAME","USERPROFILE","HOMEDRIVE","HOMEPATH","APPDATA","LOCALAPPDATA","SYSTEMROOT","WINDIR","TEMP","TMP","TMPDIR","LANG","LC_ALL","TERM","CODEX_HOME","CLAUDE_CONFIG_DIR","XDG_CONFIG_HOME","XDG_DATA_HOME","XDG_CACHE_HOME"]){if(process.env[k])env[k]=process.env[k]}return env}
async function execute(job){
 const codex=job.provider==="codex";const name=codex?"codex":"claude";
 const args=codex?["exec","--json","--ephemeral","--sandbox","read-only","--skip-git-repo-check",...(job.model?["-m",job.model]:[]),"-"]:["-p","--output-format","json","--max-turns","1","--tools","",...(job.model?["--model",job.model]:[])];
 const cwd=await mkdtemp(join(tmpdir(),"galeen-cli-"));
 try{
  let output=await new Promise((resolve,reject)=>{const p=spawn(name,args,{cwd,env:envForCli(),shell:false,stdio:["pipe","pipe","pipe"]});let s="",errors="",done=false;const timer=setTimeout(()=>p.kill("SIGTERM"),175000);p.stdout.setEncoding("utf8");p.stderr.setEncoding("utf8");p.stdout.on("data",x=>{s+=x;if(s.length>2000000)p.kill("SIGTERM")});p.stderr.on("data",x=>{errors=(errors+x).slice(-1000)});p.on("error",e=>{if(!done){done=true;clearTimeout(timer);reject(e)}});p.on("close",code=>{if(done)return;done=true;clearTimeout(timer);if(code!==0||s.length>2000000)reject(Error(name+" falló: "+errors.slice(-400)));else resolve(s)});p.stdin.on("error",()=>{});p.stdin.end(job.prompt)});
  const answer=codex?parseCodex(output):parseClaude(output);return answer.slice(0,55000);
 }finally{await rm(cwd,{recursive:true,force:true})}
}
if(cmd==="pair"){
 try{const code=process.env.GALEEN_PAIRING_CODE;if(!code||!url)throw Error("Configura GALEEN_PAIRING_CODE y GALEEN_URL.");const data=await request({url},"agent.pair",{code,name:hostname()});await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file,JSON.stringify({url:origin(url),token:data.token}),{mode:0o600});console.log("Agente vinculado:",data.resourceId)}catch(e){console.error(e.message);process.exitCode=1}
}else if(cmd==="start"||cmd==="once"){
 try{const cfg=await config();const limit=Number(process.env.GALEEN_AGENT_CONCURRENCY||50);if(!Number.isInteger(limit)||limit<1||limit>50)throw Error("Concurrencia de 1 a 50.");const tasks=new Set();let stopping=false;process.on("SIGINT",()=>{stopping=true});process.on("SIGTERM",()=>{stopping=true});while(!stopping){const available=limit-tasks.size;if(available>0){let result;try{result=await request(cfg,"agent.claim",{limit:available})}catch(e){const message=String(e?.message||e);if(/autorizado|revocado|inválido|invalid|401|403/i.test(message))throw e;console.error("Conexión con GALEEN interrumpida:",message);if(cmd==="once")throw e;await sleep(5000);continue}for(const job of result.jobs||[]){const task=(async()=>{const heartbeat=setInterval(()=>{void request(cfg,"agent.heartbeat",{jobId:job.jobId,runId:job.runId}).catch(e=>console.error("Heartbeat:",String(e?.message||e)))},30000);try{const output=await execute(job);await request(cfg,"agent.finish",{jobId:job.jobId,runId:job.runId,ok:true,output})}catch(e){try{await request(cfg,"agent.finish",{jobId:job.jobId,runId:job.runId,ok:false,error:String(e?.message||e).slice(0,500)})}catch{}}finally{clearInterval(heartbeat)}})();tasks.add(task);void task.finally(()=>tasks.delete(task))}if(cmd==="once"){await Promise.allSettled([...tasks]);break}if(!tasks.size){await request(cfg,"agent.heartbeat");await sleep(3000)}else await Promise.race([sleep(3000),...tasks])}else await Promise.race(tasks)}await Promise.allSettled([...tasks]);}catch(e){console.error(e.message);process.exitCode=1}
}else{console.log("GALEEN agente local: node broker/agent/runner.mjs pair | start | once");}

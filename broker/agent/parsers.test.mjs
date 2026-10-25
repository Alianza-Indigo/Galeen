import {test} from "node:test";
import {strict as assert} from "node:assert";
import {parseCodex,parseClaude} from "./parsers.mjs";

test("Codex JSONL selects final assistant message",()=>{
 const events=[
  {type:"thread.started"},
  {type:"item.completed",item:{type:"agent_message",text:"first"}},
  {type:"item.completed",item:{type:"agent_message",text:"last"}}
 ].map(JSON.stringify).join("\n");
 assert.equal(parseCodex(events),"last");
});
test("Codex rejects incomplete outputs",()=>{
 assert.throws(()=>parseCodex('{"type":"turn.completed"}'),/Codex no devolvió texto/);
});
test("Claude extracts a result",()=>{
 assert.equal(parseClaude(JSON.stringify({type:"result",is_error:false,result:"ok"})),"ok");
});
test("Claude reports CLI errors",()=>{
 assert.throws(()=>parseClaude(JSON.stringify({type:"result",is_error:true,result:"failed"})),/Claude devolvió error/);
});

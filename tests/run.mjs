import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
// Tests use a fresh local-only D1 directory, never production or a developer's data.
fs.mkdirSync('.sites-runtime',{recursive:true});
const stateDir=fs.mkdtempSync(path.resolve('.sites-runtime/test-db-'));
const env={...process.env,XDG_CONFIG_HOME:path.resolve('.sites-runtime/config')};
const config='dist/server/wrangler.json';
if(!fs.existsSync(config))throw Error('Run npm run build first.');
for(const migration of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
 const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config',config,'--persist-to',stateDir,'--file','drizzle/'+migration],{env,stdio:'inherit'});
 if(r.status!==0)throw Error('Local test migration failed.');
}
const log=fs.openSync('.sites-runtime/e2e-server.log','w');
function launch(){return spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config',config,'--local','--persist-to',stateDir,'--ip','127.0.0.1','--inspector-port','0','--port','8788'],{detached:true,env,stdio:['ignore',log,log]});}
async function ready(){for(let n=0;n<60;n++){try{const r=await fetch('http://127.0.0.1:8788/api/v1/questions');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Local server not ready; see .sites-runtime/e2e-server.log');}
async function stop(p){if(p.exitCode!==null)return;process.kill(-p.pid,'SIGTERM');await new Promise(r=>p.on('exit',r));await new Promise(r=>setTimeout(r,300));}
let server=launch();
try{
 await ready();
 await new Promise((resolve,reject)=>{const t=spawn(process.execPath,['tests/api.mjs'],{env,stdio:'inherit'});t.on('exit',c=>c===0?resolve():reject(Error('API tests failed')));});
 await stop(server);server=launch();await ready();
 const {id,actor}=JSON.parse(fs.readFileSync('.sites-runtime/durability-test.json','utf8'));
 const q=await (await fetch('http://127.0.0.1:8788/api/v1/questions/'+id)).json();
 assert.equal(q.data.answers.length,1);
 const withdrawal=await fetch('http://127.0.0.1:8788/api/v1/posts/'+id,{method:'DELETE',headers:actor});
 assert.equal(withdrawal.status,200);
 assert.equal((await fetch('http://127.0.0.1:8788/api/v1/questions/'+id)).status,404);
 console.log('PASS: D1 question and answer survived server restart; author withdrawal hides them.');
}finally{await stop(server);fs.closeSync(log);fs.rmSync(stateDir,{recursive:true,force:true});}

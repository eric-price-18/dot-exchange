import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { CHANGED_PUBLIC_ORIGIN } from './origin-fixture.mjs';
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
function localQuery(sql){
 // Read only this test's isolated local SQLite fixture, never hosted D1.
 // Starting a second Miniflare through Wrangler can hang while the server owns it.
 const folder=path.join(stateDir,'v3/d1/miniflare-D1DatabaseObject');
 const files=fs.readdirSync(folder).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');
 assert.equal(files.length,1,'Exactly one isolated local D1 fixture');
 const db=new DatabaseSync(path.join(folder,files[0]));
 try{db.exec('PRAGMA busy_timeout=5000');return db.prepare(sql).all().map(r=>({...r}));}
 finally{db.close();}
}
function analyticsTotals(){return Object.fromEntries(localQuery('SELECT metric,SUM(count) AS n FROM analytics_daily GROUP BY metric').map(r=>[r.metric,r.n]));}
const log=fs.openSync('.sites-runtime/e2e-server.log','w');
function launch(origin){return spawn(process.execPath,['tests/worker.mjs',stateDir,...(origin?[origin]:[])],{detached:process.platform!=='win32',env,stdio:['ignore',log,log,'ipc']});}
async function ready(p){for(let n=0;n<60;n++){if(p.exitCode!==null||p.signalCode!==null)throw Error('Local test Worker exited before readiness; see .sites-runtime/e2e-server.log');try{const r=await checkedFetch('http://127.0.0.1:8788/api/v1/questions');const ok=r.ok;await r.text();if(ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Local server not ready; see .sites-runtime/e2e-server.log');}
async function stop(p){
 if(p.exitCode!==null||p.signalCode!==null)return;
 const exited=new Promise(r=>p.once('exit',r));
 if(p.connected)p.send('stop');else if(process.platform==='win32')p.kill();else process.kill(-p.pid,'SIGTERM');
 let timer;
 await Promise.race([exited,new Promise(r=>{timer=setTimeout(()=>{try{if(process.platform==='win32')p.kill('SIGKILL');else process.kill(-p.pid,'SIGKILL');}catch{}r();},5000);})]);
 clearTimeout(timer);
 await new Promise(r=>setTimeout(r,300));
}
async function checkedFetch(url,options={}){
 return fetch(url,{...options,signal:AbortSignal.timeout(10000)});
}
localQuery("INSERT INTO analytics_daily(day,metric,channel,operation,outcome,traffic_class,count) VALUES('2000-01-01','page_requests','web','home','success','unclassified',1)");
// A pre-migration-style synthetic post has no retry receipt. Never import real data.
localQuery(`INSERT INTO posts(id,kind,title,body,tags,author_label,author_key,created_at,request_key) VALUES('q_11111111-1111-4111-8111-111111111111','question','Legacy original question','Legacy original body, unchanged.','["legacy"]','legacy-label','${createHash('sha256').update('legacy-owner').digest('hex')}','2001-01-01T00:00:00.000Z','legacy-request-key')`);
const capOwner=createHash('sha256').update('enhancement-cap-owner').digest('hex');
for(const [id,kind] of [['q_33333333-3333-4333-8333-333333333333','question'],['t_44444444-4444-4444-8444-444444444444','tip']]){
 localQuery(`INSERT INTO posts(id,kind,title,body,tags,author_label,author_key,created_at) VALUES('${id}','${kind}','Synthetic boundary fixture','Only local boundary test content.','[]','cap-label','${capOwner}','2001-01-01T00:00:00.000Z')`);
 localQuery(`WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<200) INSERT INTO posts(id,kind,parent_id,body,author_label,author_key,created_at) SELECT '${kind==='question'?'a':'r'}_'||printf('%08x',n)||'-5555-4555-8555-555555555555','${kind==='question'?'answer':'reply'}','${id}','Synthetic boundary child body.','cap-label','${capOwner}','2001-01-01T00:00:00.000Z' FROM numbers`);
}
localQuery("WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<100) INSERT INTO post_updates(id,post_id,body,created_at) SELECT 'u_'||printf('%08x',n)||'-6666-4666-8666-666666666666','q_33333333-3333-4333-8333-333333333333','Synthetic boundary history entry.','2001-01-01T00:00:00.000Z' FROM numbers");
localQuery("WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<100) INSERT INTO post_updates(id,post_id,body,created_at) SELECT 'u_'||printf('%08x',n)||'-7777-4777-8777-777777777777','a_00000001-5555-4555-8555-555555555555','Synthetic boundary child history.','2001-01-01T00:00:00.000Z' FROM numbers");
const dailyOwner=createHash('sha256').update('enhancement-daily').digest('hex'),testDay=Math.floor(Date.now()/86400000);
localQuery(`INSERT INTO rate_limits(key,count,expires_at) VALUES('d:${dailyOwner}:${testDay}',50,${(testDay+1)*86400000})`);
let server=launch();
try{
 await ready(server);
 // Keep one HTTP client alive across suites. In workerd on Windows, exiting a
 // suite subprocess can reset a pooled socket while the next suite starts.
 await import('./read-surfaces.mjs');
 await import('./api.mjs');
 await import('./enhancements.mjs');
 await import('./origin-regression.mjs');
 const {runEditing}=await import('./editing.mjs');await runEditing(localQuery);
 if(process.env.E2E_BROWSER_EXECUTABLE){const {runEditingBrowser}=await import('./editing-browser.mjs');await runEditingBrowser(process.env.E2E_BROWSER_EXECUTABLE);}
 // Allow Worker waitUntil tasks to finish before inspecting local-only aggregates.
 await new Promise(r=>setTimeout(r,200));
 await stop(server);
 const totals=analyticsTotals();
 console.log('Local aggregate verification:',totals);
 assert.equal(totals.questions_created,12,'New questions count once despite idempotent/lost-response retries');
 assert.equal(totals.answers_created,2,'New answers count once despite retries');
 assert.equal(totals.tips_created,1,'A new tip counts once despite idempotent replay');
 assert.equal(totals.replies_created,1,'A new reply counts once');
 assert.equal(totals.searches,4,'Successful searches, no cursor-pagination searches');
 assert.equal(totals.page_requests,5,'Home, API guide, question document, and two Start Here checks');
 assert.equal(totals.mcp_tool_calls,4,'Two successes and two semantic tool errors');
 const mcpOutcomes=localQuery("SELECT outcome,SUM(count) AS n FROM analytics_daily WHERE metric='mcp_tool_calls' GROUP BY outcome");
 assert.deepEqual(Object.fromEntries(mcpOutcomes.map(r=>[r.outcome,r.n])),{error:2,success:2});
 const snapshot=JSON.stringify(localQuery('SELECT * FROM analytics_daily'));
 for(const prohibited of ['Synthetic','example.test','local-e2e','UI lost','qa-test','durability','q_','a_'])assert.ok(!snapshot.includes(prohibited),'Analytics must not contain '+prohibited);
 assert.equal(localQuery("SELECT COUNT(*) AS n FROM analytics_daily WHERE day='2000-01-01'")[0].n,0,'Expired aggregates pruned');
 console.log('PASS: aggregate counts, privacy, MCP semantic outcomes, exclusions, no public analytics endpoints, and retention on local D1.');
 server=launch(CHANGED_PUBLIC_ORIGIN);await ready(server);
 // The same build and stored posts use the new runtime origin after restart.
 const originFixture=JSON.parse(fs.readFileSync('.sites-runtime/origin-durability.json','utf8'));
 const smoke={'User-Agent':'DotExchangeSmokeTest/1.0'};
 for(const [kind,post] of [['questions',originFixture.question],['tips',originFixture.tip]]){
  const response=await checkedFetch('http://127.0.0.1:8788/api/v1/'+kind+'/'+post.id,{headers:smoke});
  assert.equal(response.status,200);const detail=await response.json();
  assert.equal(new URL(detail.data.url).origin,CHANGED_PUBLIC_ORIGIN);
  for(const child of detail.data.answers||detail.data.replies)assert.equal(new URL(child.url).origin,CHANGED_PUBLIC_ORIGIN);
 }
 const replayResponse=await checkedFetch('http://127.0.0.1:8788/api/v1/questions',{method:'POST',headers:{...smoke,...originFixture.actor,'Content-Type':'application/json','Idempotency-Key':'origin-question'},body:JSON.stringify(originFixture.payload)});
 assert.equal(replayResponse.status,201);const replay=await replayResponse.json();
 assert.equal(replay.replayed,true);assert.equal(replay.data.id,originFixture.question.id);assert.equal(new URL(replay.data.url).origin,CHANGED_PUBLIC_ORIGIN);
 console.log('PASS: runtime origin changes without rebuilding, migrating data or stale idempotent URLs.');
 const edited=JSON.parse(fs.readFileSync('.sites-runtime/editing-durability.json','utf8'));
 const ed=await (await checkedFetch('http://127.0.0.1:8788/api/v1/tips/'+edited.tip_id,{headers:smoke})).json();assert.equal(ed.data.revision,5);assert.equal(ed.data.updates[0].revision,2);
 const eh=await (await checkedFetch('http://127.0.0.1:8788/api/v1/revisions/'+edited.tip_id,{headers:smoke})).json();assert.equal(eh.data.length,4);
 const eq=await (await checkedFetch('http://127.0.0.1:8788/api/v1/questions/'+edited.question_id,{headers:smoke})).json();assert.equal(eq.data.answers[0].edit_locked,true);
 console.log('PASS: edited content, prior versions and acceptance state survive restart.');
 const enhanced=JSON.parse(fs.readFileSync('.sites-runtime/enhancement-durability.json','utf8'));
 const enhancedQuestion=await (await checkedFetch('http://127.0.0.1:8788/api/v1/questions/'+enhanced.question_id,{headers:{'User-Agent':'DotExchangeSmokeTest/1.0'}})).json();
 assert.equal(enhancedQuestion.data.body,enhanced.original);assert.equal(enhancedQuestion.data.updates.length,2);assert.equal(enhancedQuestion.data.accepted_answer_id,enhanced.accepted_answer_id);assert.equal(enhancedQuestion.data.resolved,true);
 const enhancedTip=await (await checkedFetch('http://127.0.0.1:8788/api/v1/tips/'+enhanced.tip_id,{headers:{'User-Agent':'DotExchangeSmokeTest/1.0'}})).json();
 assert.equal(enhancedTip.data.updates.length,1);assert.equal(enhancedTip.data.replies[0].id,enhanced.reply_id);assert.equal(enhancedTip.data.replies[0].updates.length,1);
 assert.equal(localQuery("SELECT count(*) AS n FROM post_updates u JOIN posts p ON p.id=u.post_id WHERE p.deleted_at IS NOT NULL")[0].n,4,'Withdrawal preserves stored update history');
 assert.equal(localQuery("SELECT accepted_answer_id,resolved_at FROM posts WHERE id='q_11111111-1111-4111-8111-111111111111'")[0].accepted_answer_id,null,'Thread withdrawal also clears acceptance');
 console.log('PASS: accepted self-answer, original text, dated history, tips and replies survive Worker restart; hidden history remains stored.');
 const {id,actor}=JSON.parse(fs.readFileSync('.sites-runtime/durability-test.json','utf8'));
 const q=await (await checkedFetch('http://127.0.0.1:8788/api/v1/questions/'+id)).json();
 assert.equal(q.data.answers.length,1);
 const withdrawal=await checkedFetch('http://127.0.0.1:8788/api/v1/posts/'+id,{method:'DELETE',headers:actor});
 assert.equal(withdrawal.status,200);await withdrawal.text();
 const hidden=await checkedFetch('http://127.0.0.1:8788/api/v1/questions/'+id);assert.equal(hidden.status,404);await hidden.text();
 await stop(server);assert.equal(analyticsTotals().questions_created,12,'Analytics survived server restart');
 console.log('PASS: D1 question and answer survived server restart; author withdrawal hides them.');
}catch(error){
 console.error('Local test Worker diagnostics:');
 console.error(fs.readFileSync('.sites-runtime/e2e-server.log','utf8'));
 throw error;
}finally{await stop(server);fs.closeSync(log);fs.rmSync(stateDir,{recursive:true,force:true});}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPostPublisher } from '../lib/post-publisher.mjs';
const base=process.env.BASE_URL||'http://127.0.0.1:8788';
const testOrigin=new URL(base);
if(testOrigin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(testOrigin.hostname))throw Error('Tests may only target an HTTP loopback server, never production.');
const actor={'oai-authenticated-user-id':'local-e2e-'+Date.now(),'oai-authenticated-user-email':'synthetic@example.test'};
async function request(path,method='GET',body,extra={}){const r=await fetch(base+path,{method,signal:AbortSignal.timeout(10000),headers:{...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data,headers:r.headers};}
const paths=['/','/api','/api/v1','/openapi.json','/llms.txt','/robots.txt','/sitemap.xml','/.well-known/dot-exchange.json'];for(const path of paths){const page=await request(path);assert.equal(page.status,200,path);if(['/', '/api', '/api/v1', '/llms.txt', '/.well-known/dot-exchange.json'].includes(path))assert.ok(JSON.stringify(page.data).includes('https://github.com/eric-price-18/dot-exchange'),'Repository link: '+path);}
assert.equal((await request('/api/v1/questions','POST',{title:'Synthetic test question',body:'Synthetic test body only.'})).status,401);
assert.equal((await request('/api/v1/questions?limit=0')).status,400);
assert.equal((await request('/api/v1/questions?cursor=bad')).status,400);
assert.equal((await request('/api/v1/questions','POST',{title:'x',body:'short'},actor)).status,400);
assert.equal((await request('/api/v1/questions','POST',{title:'Synthetic test question',body:'Synthetic test body only.'},{...actor,Origin:'https://evil.example'})).status,403);
const payload={title:'Synthetic durability test?',body:'Synthetic test content. <script>alert(1)</script> is plain text.',tags:['api'],author_label:'qa-test'};
const key='test-'+crypto.randomUUID();let created=await request('/api/v1/questions','POST',payload,{...actor,'Idempotency-Key':key});assert.equal(created.status,201,JSON.stringify(created));let id=created.data.data.id;
assert.ok(id.startsWith('q_'));assert.equal(created.data.data.content_trust,'untrusted_user_content');assert.ok(!JSON.stringify(created.data).includes('example.test'));
const repeat=await request('/api/v1/questions','POST',payload,{...actor,'Idempotency-Key':key});assert.equal(repeat.data.data.id,id);assert.equal(repeat.data.replayed,true);
assert.equal((await request('/api/v1/questions','POST',{...payload,body:'Different content in request'},{...actor,'Idempotency-Key':key})).status,409);
const answer=await request(`/api/v1/questions/${id}/answers`,'POST',{body:'This is a synthetic test answer.',author_label:'qa-test'},actor);assert.equal(answer.status,201);
const detail=await request(`/api/v1/questions/${id}`);assert.equal(detail.data.data.answers.length,1);assert.equal(detail.data.data.answer_count,1);
assert.equal((await request('/api/v1/questions?q=durability')).data.data.some(x=>x.id===id),true);
assert.equal((await request('/api/v1/questions?q=%25')).status,200);
const html=await request(`/questions/${id}`);assert.equal(html.status,200);assert.ok(!html.data.includes('<script>alert(1)</script>'));
assert.equal((await request(`/api/v1/posts/${id}`,'DELETE',undefined,{'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.test'})).status,403);
let m=await request('/mcp','POST',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}});assert.equal(m.data.result.protocolVersion,'2025-06-18');
m=await request('/mcp','POST',{jsonrpc:'2.0',id:2,method:'tools/list'});assert.equal(m.data.result.tools.length,5);
m=await request('/mcp','POST',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_question',arguments:{id}}});assert.equal(m.data.result.structuredContent.data.id,id);
m=await request('/mcp','POST',{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'ask_question',arguments:payload}});assert.equal(m.data.result.isError,true);assert.match(m.data.result.content[0].text,/authentication_required/);
// Exercise the browser's actual submission helper against D1, losing each first response.
const retryActor={'oai-authenticated-user-id':'ui-retry-'+Date.now(),'oai-authenticated-user-email':'retry@example.test'};
async function lostResponsePublisher(){
 let drop=true;
 return createPostPublisher({fetcher:async(endpoint,init)=>{
  const r=await fetch(base+endpoint,{...init,headers:{...init.headers,...retryActor}});
  if(drop){drop=false;await r.text();throw new Error('Simulated lost response after persistence');}
  return r;
 }});
}
const qPublisher=await lostResponsePublisher();
const retryPayload={title:'UI lost response regression',body:'Synthetic local retry regression content.'};
await assert.rejects(qPublisher.publish('/api/v1/questions',retryPayload),/lost response/);
const retryQuestion=await qPublisher.publish('/api/v1/questions',retryPayload);
assert.equal((await request('/api/v1/questions?q=UI%20lost%20response%20regression')).data.data.length,1);
const aPublisher=await lostResponsePublisher();
const answerPath=`/api/v1/questions/${retryQuestion.id}/answers`;
const retryAnswer={body:'Synthetic answer for lost response regression.'};
await assert.rejects(aPublisher.publish(answerPath,retryAnswer),/lost response/);
const confirmedAnswer=await aPublisher.publish(answerPath,retryAnswer);
const retryDetail=(await request(`/api/v1/questions/${retryQuestion.id}`)).data.data;
assert.equal(retryDetail.answers.length,1);assert.equal(retryDetail.answers[0].id,confirmedAnswer.id);
for(const malformed of [{jsonrpc:'2.0',id:true,method:'ping'},{jsonrpc:'2.0',id:5,method:'tools/call',params:[]},{jsonrpc:'2.0',id:6,method:'tools/call',params:{name:'get_question',arguments:'bad'}}])assert.equal((await request('/mcp','POST',malformed)).status,400);
const missingId=await request('/mcp','POST',{jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'get_question',arguments:{}}});assert.equal(missingId.data.result.isError,true);assert.match(missingId.data.result.content[0].text,/invalid_input/);
const rateActor={'oai-authenticated-user-id':'rate-'+Date.now(),'oai-authenticated-user-email':'rate@example.test'};
for(let n=0;n<10;n++)assert.equal((await request('/api/v1/questions','POST',{title:`Rate limit fixture ${n}`,body:'Only local synthetic test content.'},rateActor)).status,201);
const limited=await request('/api/v1/questions','POST',payload,rateActor);assert.equal(limited.status,429);assert.ok(limited.headers.get('retry-after'));
const first=await request('/api/v1/questions?limit=2');assert.equal(first.data.data.length,2);assert.ok(first.data.next_cursor);const second=await request('/api/v1/questions?limit=2&cursor='+encodeURIComponent(first.data.next_cursor));assert.equal(new Set([...first.data.data,...second.data.data].map(x=>x.id)).size,4);
assert.equal((await request('/api/v1/questions','POST',{title:'Synthetic test question',body:'x'.repeat(22000)},actor)).status,413);
fs.writeFileSync('.sites-runtime/durability-test.json',JSON.stringify({id,actor}));
console.log(JSON.stringify({pass:true,checks:'Public routes, create, answer, read, search, pagination, XSS escaping, idempotency, ownership, authentication, request bounds, cross-origin rejection, rate limiting, MCP discovery/read/write gate and malformed inputs, browser-helper lost-response retry regression',durability_id:id}));

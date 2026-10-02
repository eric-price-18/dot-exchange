import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:8788';
const smoke={'User-Agent':'DotExchangeSmokeTest/1.0'};
export const actor=name=>({...smoke,'oai-authenticated-user-id':'edit-'+name,'oai-authenticated-user-email':name+'@example.test'});
export async function request(path,method='GET',body,headers={}) {
 const r=await fetch(base+path,{method,headers:{...smoke,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 return {status:r.status,data:await r.json()};
}
async function ok(path,method,body,headers,status=200){const r=await request(path,method,body,headers);assert.equal(r.status,status,JSON.stringify(r));return r.data;}
const payload={title:'Editing synthetic public title',body:'Original synthetic public content.',tags:['editing'],author_label:'same-label'};
const patch=(id,revision,body='Edited synthetic public content.')=>({body,expected_revision:revision,idempotency_key:'edit-key-'+id});
const mcp=async(name,args,headers)=>(await ok('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},headers)).result;
export async function runEditing(localQuery){
 const owner=actor('owner'),other=actor('other');
 const tip=(await ok('/api/v1/tips','POST',payload,owner,201)).data;
 const reply=(await ok(`/api/v1/tips/${tip.id}/replies`,'POST',{body:'Synthetic reply remains linked.'},other,201)).data;
 const path=`/api/v1/posts/${tip.id}`,read=()=>ok(`/api/v1/tips/${tip.id}`);
 const update=(await ok(path+'/updates','POST',{body:'Original dated update content.'},owner,201)).data;
 const edit={...patch('first',1),title:'Edited synthetic public title',tags:['revised']};
 assert.equal((await request(path,'PATCH',edit)).status,401);
 assert.equal((await request(path,'PATCH',edit,other)).status,403);
 assert.equal((await request(path,'PATCH',edit,{...owner,Origin:'https://other.example.test'})).status,403);
 for(const change of [{expected_revision:undefined},{expected_revision:0},{expected_revision:'1'},{expected_revision:1.2},{expected_revision:9007199254740992},{body:[]},{body:'short'},{body:'x'.repeat(10001)},{title:'x'},{tags:['BAD']},{tags:Array(6).fill('tag')},{author_label:'forged'},{created_at:'2020'},{idempotency_key:undefined}]){
  assert.equal((await request(path,'PATCH',{...edit,...change},owner)).status,400,JSON.stringify(change));
 }
 assert.equal((await request(path,'PATCH',{...edit,body:'x'.repeat(22000)},owner)).status,413);
 const edited=await ok(path,'PATCH',edit,owner);
 assert.equal(edited.data.revision,2);
 assert.deepEqual((await ok(path,'PATCH',edit,owner)).data,edited.data);
 assert.equal((await request(path,'PATCH',{...edit,body:'Different content with same key.'},owner)).status,409);
 assert.equal((await request(path,'PATCH',{...edit,idempotency_key:'edit-stale-key'},owner)).data.error.code,'stale_revision');
 let current=(await read()).data;
 for(const field of ['id','created_at','url','author'])assert.deepEqual(current[field],tip[field]);
 assert.equal(current.body,edit.body);assert.deepEqual(current.tags,['revised']);assert.equal(current.replies[0].id,reply.id);assert.equal(current.updates[0].id,update.id);
 const history=await ok(`/api/v1/revisions/${tip.id}`);
 assert.equal(history.data.length,1);assert.equal(history.data[0].body,tip.body);assert.equal(history.data[0].title,tip.title);assert.deepEqual(history.data[0].tags,tip.tags);
 assert.ok(!JSON.stringify(history).includes('author_key'));
 const result=await mcp('edit_post',{id:tip.id,...patch('second',2,'Second synthetic revision text.')},owner);assert.equal(result.isError,false);
 assert.equal((await mcp('edit_post',{id:tip.id,...patch('unauthorized',3)},other)).isError,true);
 assert.equal((await mcp('edit_post',{id:tip.id,...patch('stale',1)},owner)).isError,true);
 assert.equal((await ok(path,'PATCH',edit,owner)).replayed,true);assert.equal((await read()).data.revision,3);
 const editedUpdate=await mcp('edit_update',{post_id:tip.id,update_id:update.id,...patch('update',1,'Revised dated update content.')},owner);assert.equal(editedUpdate.isError,false);
 const uPath=path+'/updates/'+update.id;
 assert.equal((await request(uPath,'PATCH',patch('update-unauth',2),other)).status,403);
 assert.equal((await request(uPath,'PATCH',patch('update-stale',1),owner)).status,409);
 assert.equal((await request(uPath,'PATCH',{...patch('bad',2),title:'Wrong target title'},owner)).status,400);
 current=(await read()).data;assert.equal(current.updates[0].created_at,update.created_at);assert.equal(current.updates[0].revision,2);
 assert.equal((await mcp('get_revisions',{id:update.id})).structuredContent.data[0].body,update.body);
 const duplicates=await Promise.all([request(path,'PATCH',patch('duplicate',3),owner),request(path,'PATCH',patch('duplicate',3),owner)]);
 assert.deepEqual(duplicates.map(r=>r.status),[200,200]);assert.deepEqual(duplicates[0].data.data,duplicates[1].data.data);
 const race=await Promise.all([request(path,'PATCH',patch('race-a',4,'Race candidate alpha content.'),owner),request(path,'PATCH',patch('race-b',4,'Race candidate beta content.'),owner)]);
 assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal((await read()).data.revision,5);
 assert.equal((await ok(`/api/v1/revisions/${tip.id}`)).data.length,4);
 // Independently owned replies are editable; parent author does not own them.
 assert.equal((await request(`/api/v1/posts/${reply.id}`,'PATCH',patch('reply',1),owner)).status,403);
 await ok(`/api/v1/posts/${reply.id}`,'PATCH',patch('reply',1),other);
 const qOwner=actor('qowner'),aOwner=actor('aowner');
 const q=(await ok('/api/v1/questions','POST',payload,qOwner,201)).data;
 const a=(await ok(`/api/v1/questions/${q.id}/answers`,'POST',{body:'Answer original public content.'},aOwner,201)).data;
 const au=(await ok(`/api/v1/posts/${a.id}/updates`,'POST',{body:'Answer original dated update.'},aOwner,201)).data;
 await ok(`/api/v1/posts/${a.id}`,'PATCH',patch('answer',1),aOwner);
 await ok(`/api/v1/posts/${q.id}`,'PATCH',{...patch('question',1),title:'Revised question title'},qOwner);
 const accept=`/api/v1/questions/${q.id}/acceptance`;
 const setAccept=async(answer_id,extra={})=>{const state=(await ok(`/api/v1/questions/${q.id}`)).data;return ok(accept,'POST',{answer_id,expected_acceptance_revision:state.acceptance_revision,...(answer_id?{expected_answer_revision:state.answers.find(x=>x.id===answer_id).revision,expected_answer_content_version:state.answers.find(x=>x.id===answer_id).content_version}:{}),...extra},qOwner);};
 await setAccept(a.id);
 for(const target of [`/api/v1/posts/${a.id}`,`/api/v1/posts/${a.id}/updates/${au.id}`])assert.equal((await request(target,'PATCH',patch('locked',target.endsWith(au.id)?1:2),aOwner)).data.error.code,'accepted_answer_locked');
 assert.equal((await mcp('edit_post',{id:a.id,...patch('locked-mcp',2)},aOwner)).isError,true);
 await setAccept(null);
 await ok(`/api/v1/posts/${a.id}`,'PATCH',patch('after-unaccept',2,'Revised answer after unacceptance.'),aOwner);
 assert.equal((await ok(`/api/v1/questions/${q.id}`)).data.answers[0].edit_locked,false);
 assert.equal((await request(accept,'POST',{answer_id:a.id,expected_acceptance_revision:3,expected_answer_revision:2,expected_answer_content_version:3},qOwner)).status,409);
 await setAccept(a.id);
 assert.equal((await request(`/api/v1/posts/${a.id}/updates`,'POST',{body:'Append attempt after acceptance.',idempotency_key:'locked-append-new'},aOwner)).status,409);
 // SQL batch serialization: if editing wins it is part of the accepted version;
 // if acceptance wins, the edit must fail. No write after acceptance is permitted.
 for(let i=0;i<3;i++){
  const qa=actor('race-q'+i),aa=actor('race-a'+i);
  const rq=(await ok('/api/v1/questions','POST',payload,qa,201)).data;
  const ra=(await ok(`/api/v1/questions/${rq.id}/answers`,'POST',{body:'Concurrent acceptance original.'},aa,201)).data;
  const [e,c]=await Promise.all([request(`/api/v1/posts/${ra.id}`,'PATCH',patch('accept-race',1),aa),request(`/api/v1/questions/${rq.id}/acceptance`,'POST',{answer_id:ra.id,expected_acceptance_revision:1,expected_answer_revision:1,expected_answer_content_version:1},qa)]);
  assert.deepEqual([e.status,c.status].sort(),[200,409]);
  const saved=(await ok(`/api/v1/questions/${rq.id}`)).data.answers[0];assert.equal(saved.edit_locked,c.status===200);assert.equal(saved.revision,e.status===200?2:1);
  if(c.status===200)assert.equal((await request(`/api/v1/posts/${ra.id}`,'PATCH',patch('after-race',saved.revision),aa)).status,409);
 }
 // Unaccept/edit races serialize: either the edit sees the lock and fails, or
 // it follows the successful unaccept. Reaccepting a stale answer must fail.
 for(let i=0;i<2;i++){
  const qa=actor('clear-race-q'+i),aa=actor('clear-race-a'+i);
  const rq=(await ok('/api/v1/questions','POST',payload,qa,201)).data;
  const ra=(await ok(`/api/v1/questions/${rq.id}/answers`,'POST',{body:'Unaccept concurrency original.'},aa,201)).data;
  const acceptance=`/api/v1/questions/${rq.id}/acceptance`;
  await ok(acceptance,'POST',{answer_id:ra.id,expected_acceptance_revision:1,expected_answer_revision:1,expected_answer_content_version:1},qa);
  const [clear,edit]=await Promise.all([request(acceptance,'POST',{answer_id:null,expected_acceptance_revision:2},qa),request(`/api/v1/posts/${ra.id}`,'PATCH',patch('unaccept-race',1),aa)]);
  assert.equal(clear.status,200);assert.ok([200,409].includes(edit.status));
  const state=(await ok(`/api/v1/questions/${rq.id}`)).data;
  assert.equal(state.resolved,false);assert.equal(state.answers[0].edit_locked,false);
  assert.equal(state.answers[0].revision,edit.status===200?2:1);
  if(edit.status===200)assert.equal((await request(acceptance,'POST',{answer_id:ra.id,expected_acceptance_revision:3,expected_answer_revision:1,expected_answer_content_version:1},qa)).status,409);
 }
 // Acceptance and unacceptance are question-author only and CAS-protected.
 assert.equal((await request(accept,'POST',{answer_id:null,expected_acceptance_revision:4},aOwner)).status,403);
 assert.equal((await request(accept,'POST',{answer_id:null},qOwner)).status,400);
 assert.equal((await request(accept,'POST',{answer_id:null,expected_acceptance_revision:1},qOwner)).status,409);
 const clearArgs={question_id:q.id,answer_id:null,expected_acceptance_revision:4,idempotency_key:'clear-mcp-safe'};
 const clear=await mcp('set_accepted_answer',clearArgs,qOwner);assert.equal(clear.isError,false);
 assert.equal((await mcp('set_accepted_answer',clearArgs,qOwner)).isError,false);
 assert.equal((await ok(`/api/v1/questions/${q.id}`)).data.answers[0].edit_locked,false);
 // Concurrent stale acceptance/unacceptance cannot undo a newer state.
 await setAccept(a.id,{idempotency_key:'reaccept-current'});
 assert.equal((await mcp('set_accepted_answer',clearArgs,qOwner)).isError,false);
 assert.equal((await ok(`/api/v1/questions/${q.id}`)).data.accepted_answer_id,a.id);
 const ah=(await mcp('get_acceptance_history',{question_id:q.id})).structuredContent;
 assert.equal(ah.data[0].answer_id,a.id);assert.equal(ah.data[0].answer_revision,3);
 assert.ok(ah.data.some(h=>h.answer_id===null));assert.ok(ah.data.some(h=>h.answer_revision===2));
 // Bounded history pagination uses synthetic local-only snapshots.
 const pageOwner=actor('pagination');
 const paged=(await ok('/api/v1/tips','POST',payload,pageOwner,201)).data;
 for(let n=1;n<=25;n++)localQuery(`INSERT INTO content_revisions VALUES('${paged.id}',${n},'Synthetic historical content',NULL,NULL,'2001-01-01','2001-01-02')`);
 const page1=await ok(`/api/v1/revisions/${paged.id}`);assert.equal(page1.data.length,20);assert.equal(page1.next_before,6);
 const page2=await ok(`/api/v1/revisions/${paged.id}?before=${page1.next_before}`);assert.deepEqual(page2.data.map(r=>r.revision),[5,4,3,2,1]);assert.equal(page2.next_before,null);
 assert.equal((await request(`/api/v1/revisions/${paged.id}?before=bad`)).status,400);
 await ok(`/api/v1/posts/${paged.id}`,'DELETE',undefined,pageOwner);
 assert.equal((await request(`/api/v1/revisions/${paged.id}`)).status,404);
 // Existing withdrawal hides edited content and its prior versions without deletion.
 await ok(`/api/v1/posts/${reply.id}`,'DELETE',undefined,other);
 assert.equal((await request(`/api/v1/revisions/${reply.id}`)).status,404);
 assert.equal(localQuery(`SELECT count(*) AS n FROM content_revisions WHERE target_id='${reply.id}'`)[0].n,1);
 fs.writeFileSync('.sites-runtime/editing-durability.json',JSON.stringify({tip_id:tip.id,question_id:q.id,answer_id:a.id}));
 console.log('PASS: author editing, immutable attribution/links, validation, revision CAS, concurrent and stale retries, dated updates, current accepted locks, edit/accept races, MCP, history pagination and withdrawal.');
}

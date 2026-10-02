import assert from 'node:assert/strict';
import {actor,request} from './editing.mjs';
async function ok(path,method,body,headers,status=200){const r=await request(path,method,body,headers);assert.equal(r.status,status,JSON.stringify(r));return r.data;}
const thread={title:'Immutable creation retry fixture',body:'Original public content before an edit.',tags:['original'],author_label:'same-label'};
export async function runReviewRegressions(localQuery){
 // Both modern receipts and pre-receipt creations must survive content edits.
 for(const legacy of [false,true])for(const kind of ['question','tip','answer','reply']){
  const owner=actor(`creation-${kind}-${legacy}`),collection=['tip','reply'].includes(kind)?'tips':'questions';
  const isChild=['answer','reply'].includes(kind);
  const parent=isChild?(await ok('/api/v1/'+collection,'POST',thread,owner,201)).data:null;
  const path=isChild?`/api/v1/${collection}/${parent.id}/${kind==='answer'?'answers':'replies'}`:'/api/v1/'+collection;
  const payload=isChild?{body:thread.body,author_label:thread.author_label}:thread;
  const keyed={...owner,'Idempotency-Key':'immutable-creation-key'};
  const created=(await ok(path,'POST',payload,keyed,201)).data;
  if(legacy)localQuery(`DELETE FROM write_receipts WHERE response LIKE '%${created.id}%'`);
  const edit={body:'Edited public content, not the original creation payload.',expected_revision:1,idempotency_key:'creation-followup-edit',...(!isChild?{title:'Edited title for creation replay',tags:['changed']}:{})};
  await ok(`/api/v1/posts/${created.id}`,'PATCH',edit,owner);
  const replay=await ok(path,'POST',payload,keyed,201);
  assert.equal(replay.replayed,true);assert.equal(replay.data.id,created.id);
  assert.equal(replay.data.body,created.body);assert.equal(replay.data.created_at,created.created_at);
  if(!isChild){assert.equal(replay.data.title,created.title);assert.deepEqual(replay.data.tags,created.tags);}
  assert.equal((await request(path,'POST',{...payload,body:edit.body},keyed)).status,409);
  assert.equal(localQuery(`SELECT count(*) AS n FROM content_revisions WHERE target_id='${created.id}'`)[0].n,1);
  await ok(`/api/v1/posts/${created.id}`,'DELETE',undefined,owner);
  assert.equal((await request(path,'POST',payload,keyed)).status,409);
 }
 // Parent withdrawal must continue hiding even a receipt-backed edited child.
 const po=actor('hidden-creation');
 const pq=(await ok('/api/v1/questions','POST',thread,po,201)).data;
 const body={body:'Child with a replay receipt.',idempotency_key:'hidden-child-key'};
 const child=(await ok(`/api/v1/questions/${pq.id}/answers`,'POST',body,po,201)).data;
 await ok(`/api/v1/posts/${child.id}`,'PATCH',{body:'Edited child before parent withdrawal.',expected_revision:1,idempotency_key:'hidden-child-edit'},po);
 await ok(`/api/v1/posts/${pq.id}`,'DELETE',undefined,po);
 assert.equal((await request(`/api/v1/questions/${pq.id}/answers`,'POST',body,po)).status,409);
 // An entire answer includes its dated updates. Mutations and acceptance use
 // the same D1 serialization boundary, and rejected operations leave no receipt.
 for(const action of ['append','edit-update']){
  const qa=actor('aggregate-q-'+action),aa=actor('aggregate-a-'+action);
  const q=(await ok('/api/v1/questions','POST',thread,qa,201)).data;
  const a=(await ok(`/api/v1/questions/${q.id}/answers`,'POST',{body:'Answer with independently editable dated updates.'},aa,201)).data;
  const uBody={body:'First synthetic dated update.',idempotency_key:'aggregate-initial-update'};
  const u=(await ok(`/api/v1/posts/${a.id}/updates`,'POST',uBody,aa,201)).data;
  const read=async()=>(await ok('/api/v1/questions/'+q.id)).data;
  const acceptPath=`/api/v1/questions/${q.id}/acceptance`;
  const accept=(state,key,version=state.answers[0].content_version)=>({answer_id:a.id,expected_acceptance_revision:state.acceptance_revision,expected_answer_revision:state.answers[0].revision,expected_answer_content_version:version,idempotency_key:key});
  const state=await read();assert.equal(state.answers[0].revision,1);assert.equal(state.answers[0].content_version,2);assert.equal(state.answers[0].edited_at,null);
  const mutationPath=`/api/v1/posts/${a.id}/updates`+(action==='append'?'':'/'+u.id),method=action==='append'?'POST':'PATCH',success=action==='append'?201:200;
  const mutation={body:'Concurrent dated content mutation.',idempotency_key:'aggregate-race-mutation',...(action==='append'?{}:{expected_revision:1})};
  const counts=()=>({receipts:localQuery('SELECT count(*) AS n FROM write_receipts')[0].n,history:localQuery(`SELECT count(*) AS n FROM content_revisions WHERE target_id='${u.id}'`)[0].n,updates:localQuery(`SELECT count(*) AS n FROM post_updates WHERE post_id='${a.id}'`)[0].n});
  const before=counts();
  const [edit,accepted]=await Promise.all([request(mutationPath,method,mutation,aa),request(acceptPath,'POST',accept(state,'aggregate-race-accept'),qa)]);
  assert.ok((edit.status===success&&accepted.status===409)||(edit.status===409&&accepted.status===200),JSON.stringify({edit,accepted}));
  const after=counts();assert.equal(after.receipts,before.receipts+1);
  assert.equal(after.history,before.history+(action==='edit-update'&&edit.status===success?1:0));
  assert.equal(after.updates,before.updates+(action==='append'&&edit.status===success?1:0));
  if(edit.status===success){
   // Main text revision is unchanged, but its dated content changed.
   assert.equal((await request(acceptPath,'POST',accept(await read(),'aggregate-stale-accept',2),qa)).status,409);
   await ok(acceptPath,'POST',accept(await read(),'aggregate-fresh-accept'),qa);
  }
  const locked=await read(),saved=counts();
  assert.equal(locked.answers[0].edit_locked,true);
  assert.equal(locked.accepted_answer_content_version,locked.answers[0].content_version);
  // Same-key success replay is still allowed; it must not append or revise again.
  const replay=await ok(`/api/v1/posts/${a.id}/updates`,'POST',uBody,aa,201);assert.equal(replay.replayed,true);
  assert.equal((await request(`/api/v1/posts/${a.id}/updates`,'POST',{body:'New append must fail while accepted.',idempotency_key:'locked-new-append'},aa)).status,409);
  const mcp=await ok('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'append_update',arguments:{id:a.id,body:'MCP append must fail while accepted.',idempotency_key:'locked-mcp-append'}}},aa);
  assert.equal(mcp.result.isError,true);assert.deepEqual(counts(),saved);
  const updateRevision=locked.answers[0].updates.find(x=>x.id===u.id).revision;
  const second={body:'Dated content following unacceptance.',idempotency_key:'aggregate-unaccept-mutation',...(action==='append'?{}:{expected_revision:updateRevision})};
  const [clear,changed]=await Promise.all([request(acceptPath,'POST',{answer_id:null,expected_acceptance_revision:locked.acceptance_revision,idempotency_key:'aggregate-unaccept'},qa),request(mutationPath,method,second,aa)]);
  assert.equal(clear.status,200);assert.ok([success,409].includes(changed.status));
  assert.equal(counts().receipts,saved.receipts+1+(changed.status===success?1:0));
  if(changed.status===409)await ok(mutationPath,method,second,aa,success);
  const unlocked=await read();assert.equal(unlocked.answers[0].revision,1);assert.equal(unlocked.answers[0].edit_locked,false);
  assert.equal(unlocked.answers[0].content_version,locked.answers[0].content_version+1);
  assert.equal(unlocked.answers[0].edited_at,null);assert.equal(unlocked.edited_at,null);
  assert.equal((await request(acceptPath,'POST',accept(unlocked,'stale-reaccept-aggregate',locked.answers[0].content_version),qa)).status,409);
  await ok(acceptPath,'POST',accept(unlocked,'current-reaccept-aggregate'),qa);
  const history=(await ok(acceptPath)).data;assert.equal(history[0].answer_content_version,unlocked.answers[0].content_version);
  await ok(`/api/v1/posts/${a.id}`,'DELETE',undefined,aa);
  assert.equal((await read()).resolved,false);assert.equal((await read()).edited_at,null);
 }
 console.log('PASS: original creation retry after edits (receipt and legacy, all post types), withdrawal safety, aggregate answer versions, accepted append lock, receipt replay, append/update-edit accept/unaccept/reaccept races and rejected-operation atomicity.');
}

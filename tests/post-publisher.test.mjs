import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostPublisher } from '../lib/post-publisher.mjs';
const id='q_11111111-1111-4111-8111-111111111111';
const input={title:'Retry-safe question',body:'A sufficiently long question body.'};
const ok=()=>Response.json({data:{id}},{status:201});

test('a lost successful response reuses the key for the unchanged draft',async()=>{
 const keys=[];let tries=0;
 const publisher=createPostPublisher({createKey:()=>`key-${++tries}`,fetcher:async(_url,init)=>{
  keys.push(init.headers['Idempotency-Key']);if(keys.length===1)throw Error('response lost');return ok();
 }});
 await assert.rejects(publisher.publish('/questions',input),/response lost/);
 assert.equal((await publisher.publish('/questions',input)).id,id);
 assert.deepEqual(keys,['key-1','key-1']);
 // A confirmed submission ends that attempt, so a later intentional post is new.
 await publisher.publish('/questions',input);assert.equal(keys[2],'key-2');
});
test('revised payload and a different endpoint start a new attempt',async()=>{
 const keys=[];let n=0;
 const publisher=createPostPublisher({createKey:()=>`key-${++n}`,fetcher:async(_url,init)=>{
  keys.push(init.headers['Idempotency-Key']);throw Error('offline');
 }});
 await assert.rejects(publisher.publish('/questions',input));
 await assert.rejects(publisher.publish('/questions',{...input,body:'Revised question body.'}));
 await assert.rejects(publisher.publish('/answers',{...input,body:'Revised question body.'}));
 assert.deepEqual(keys,['key-1','key-2','key-3']);
});
test('an immediate duplicate submit shares the in-flight request',async()=>{
 let resolveResponse;let calls=0;
 const publisher=createPostPublisher({fetcher:()=>{calls++;return new Promise(r=>{resolveResponse=r;});}});
 const a=publisher.publish('/questions',input);const b=publisher.publish('/questions',input);
 assert.equal(a,b);assert.equal(calls,1);
 await assert.rejects(publisher.publish('/questions',{...input,body:'Edited while pending.'}),/already being published/);
 resolveResponse(ok());await a;
});
test('invalid JSON, absent success ID, and server errors preserve the attempt',async()=>{
 const keys=[];let n=0;
 const responses=[new Response('truncated',{status:201}),Response.json({data:{}},{status:201}),Response.json({error:{message:'Try later'}},{status:503}),ok()];
 const publisher=createPostPublisher({createKey:()=>`key-${++n}`,fetcher:async(_url,init)=>{
  keys.push(init.headers['Idempotency-Key']);return responses.shift();
 }});
 await assert.rejects(publisher.publish('/questions',input));
 await assert.rejects(publisher.publish('/questions',input),/confirm publication/);
 await assert.rejects(publisher.publish('/questions',input),/Try later/);
 await publisher.publish('/questions',input);
 assert.deepEqual(keys,['key-1','key-1','key-1','key-1']);
});

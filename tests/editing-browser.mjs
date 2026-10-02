import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {actor,request} from './editing.mjs';
async function navigateAction(page,name){
 await Promise.all([page.waitForEvent('framenavigated',{predicate:frame=>frame===page.mainFrame()}),page.getByRole('button',{name,exact:true}).click()]);
 await page.waitForLoadState('networkidle');
}
export async function runEditingBrowser(executablePath){
 const owner=actor('browser');
 const original='Browser original synthetic body text.';
 const created=await request('/api/v1/tips','POST',{title:'Synthetic browser editing example',body:original,tags:['browser']},owner);
 assert.equal(created.status,201);const id=created.data.data.id;
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({extraHTTPHeaders:owner});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser page error:',e.message);});
  page.on('console',m=>{if(m.type()==='error')console.error('Browser console:',m.text());});
  await page.goto('http://127.0.0.1:8788/tips/'+id);await page.waitForLoadState('networkidle');
  const originalTimes=page.locator('main > .meta .post-timestamps');
  assert.match(await originalTimes.textContent(),/^Posted .* UTC$/);assert.equal(await originalTimes.locator('time').count(),1);
  assert.equal(await originalTimes.locator('time').getAttribute('datetime'),created.data.data.created_at);
  const noop=await request('/api/v1/posts/'+id,'PATCH',{body:original,expected_revision:1,idempotency_key:'browser-initial-noop'},owner);
  assert.equal(noop.data.data.revision,1);assert.equal(noop.data.data.edited_at,null);
  await page.getByRole('button',{name:'Edit post',exact:true}).click();
  await page.getByLabel('Text',{exact:true}).fill('This draft will be canceled.');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal((await request('/api/v1/tips/'+id)).data.data.revision,1);
  await page.getByRole('button',{name:'Edit post',exact:true}).click();
  assert.equal(await page.getByLabel('Text',{exact:true}).inputValue(),original);
  await page.getByLabel('Text',{exact:true}).fill('Browser successfully edited public text.');
  await navigateAction(page,'Save edit');
  const edited=(await request('/api/v1/tips/'+id)).data.data;assert.equal(edited.revision,2);
  assert.match(await originalTimes.textContent(),/^Posted .* UTC · Updated .* UTC$/);
  assert.deepEqual(await originalTimes.locator('time').evaluateAll(nodes=>nodes.map(n=>n.dateTime)),[edited.created_at,edited.edited_at]);
  await page.getByRole('button',{name:'Edit post',exact:true}).click();
  await page.getByLabel('Text',{exact:true}).fill('Retained draft after another editor saves.');
  const concurrent=await request('/api/v1/posts/'+id,'PATCH',{body:'Saved by another editor in the same account.',expected_revision:2,idempotency_key:'browser-other-edit'},owner);assert.equal(concurrent.status,200);
  await page.getByRole('button',{name:'Save edit',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(),/newer edit/);
  assert.equal(await page.getByLabel('Text',{exact:true}).inputValue(),'Retained draft after another editor saves.');
  await page.screenshot({path:'docs/screenshots/edit-conflict.png',fullPage:true});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.reload();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Edit post',exact:true}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'docs/screenshots/edit-mobile.png',fullPage:true});
  // Lose a committed response, then retry the unchanged form. The same key must
  // replay the acknowledgement without adding a second revision.
  await page.getByLabel('Text',{exact:true}).fill('Retried public text after a lost response.');
  let lost=false;
  await page.route('**/api/v1/posts/'+id,async route=>{
   if(route.request().method()==='PATCH'&&!lost){lost=true;await route.fetch();await route.abort();}else await route.continue();
  });
  await page.getByRole('button',{name:'Save edit',exact:true}).click();await page.getByRole('alert').waitFor();
  assert.equal((await request('/api/v1/tips/'+id)).data.data.revision,4);
  await navigateAction(page,'Save edit');
  assert.equal((await request('/api/v1/tips/'+id)).data.data.revision,4);
  const anonymous=await browser.newPage({extraHTTPHeaders:{'User-Agent':'DotExchangeSmokeTest/1.0'}});await anonymous.goto('http://127.0.0.1:8788/tips/'+id);assert.equal(await anonymous.getByRole('button',{name:'Edit post',exact:true}).count(),0);
  const stranger=await browser.newPage({extraHTTPHeaders:actor('browser-other')});await stranger.goto('http://127.0.0.1:8788/tips/'+id);assert.equal(await stranger.getByRole('button',{name:'Edit post',exact:true}).count(),0);
  // Editing an update or reply shows its own timestamp, without changing its parent.
  const beforeUpdate=(await request('/api/v1/tips/'+id)).data.data;
  const u=(await request(`/api/v1/posts/${id}/updates`,'POST',{body:'Original synthetic dated update.'},owner)).data.data;
  const eu=await request(`/api/v1/posts/${id}/updates/${u.id}`,'PATCH',{body:'Edited synthetic dated update.',expected_revision:1,idempotency_key:'browser-update-timestamp'},owner);assert.equal(eu.status,200);
  const replyOwner=actor('browser-reply');
  const reply=(await request(`/api/v1/tips/${id}/replies`,'POST',{body:'Original reply for timestamp checks.'},replyOwner)).data.data;
  const er=await request(`/api/v1/posts/${reply.id}`,'PATCH',{body:'Edited reply for timestamp checks.',expected_revision:1,idempotency_key:'browser-reply-timestamp'},replyOwner);assert.equal(er.status,200);
  await anonymous.reload();
  const updated=(await request('/api/v1/tips/'+id)).data.data;
  assert.equal(updated.edited_at,beforeUpdate.edited_at);
  for(const [target,createdAt,editedAt] of [[u.id,u.created_at,eu.data.data.edited_at],[reply.id,reply.created_at,er.data.data.edited_at]]){
   const stamp=anonymous.locator(`[id="${target}"] .post-timestamps`);
   assert.match(await stamp.textContent(),/^Posted .* UTC · Updated .* UTC$/);
   assert.deepEqual(await stamp.locator('time').evaluateAll(nodes=>nodes.map(n=>n.dateTime)),[createdAt,editedAt]);
  }
  await anonymous.goto('http://127.0.0.1:8788/tips');
  const listing=anonymous.locator('.question-row').filter({has:anonymous.getByRole('link',{name:'Synthetic browser editing example',exact:true})});
  assert.deepEqual(await listing.locator('.post-timestamps time').evaluateAll(nodes=>nodes.map(n=>n.dateTime)),[updated.created_at,updated.edited_at]);
  const noopLater=await request('/api/v1/posts/'+id,'PATCH',{body:updated.body,expected_revision:4,idempotency_key:'browser-later-noop'},owner);
  assert.equal(noopLater.data.data.revision,4);assert.equal(noopLater.data.data.edited_at,updated.edited_at);
  const qa=actor('browser-question'),aa=actor('browser-answer');
  const q=(await request('/api/v1/questions','POST',{title:'Question with reversible acceptance',body:'Synthetic question for acceptance controls.'},qa)).data.data;
  const a=(await request(`/api/v1/questions/${q.id}/answers`,'POST',{body:'Synthetic answer for edit lock controls.'},aa)).data.data;
  const qPage=await browser.newPage({extraHTTPHeaders:qa}),aPage=await browser.newPage({extraHTTPHeaders:aa});
  await qPage.goto('http://127.0.0.1:8788/questions/'+q.id);await qPage.waitForLoadState('networkidle');
  await navigateAction(qPage,'Accept answer');
  await aPage.goto('http://127.0.0.1:8788/questions/'+q.id);await aPage.waitForLoadState('networkidle');
  assert.equal(await aPage.getByRole('button',{name:'Edit post',exact:true}).count(),0);
  assert.equal(await aPage.getByText('Append a dated update',{exact:true}).count(),0);
  assert.equal(await aPage.getByRole('button',{name:'Clear acceptance and reopen',exact:true}).count(),0);
  await navigateAction(qPage,'Clear acceptance and reopen');
  await aPage.reload();await aPage.waitForLoadState('networkidle');
  await aPage.getByRole('button',{name:'Edit post',exact:true}).click();
  await aPage.getByLabel('Text',{exact:true}).fill('Revised answer after the question author unaccepted.');
  await navigateAction(aPage,'Save edit');
  const reopened=(await request('/api/v1/questions/'+q.id)).data.data;
  assert.equal(reopened.edited_at,null);assert.equal(reopened.resolved,false);
  assert.equal(await aPage.locator('main > .meta .post-timestamps time').count(),1);
  assert.deepEqual(await aPage.locator(`[id="${a.id}"] .meta .post-timestamps time`).evaluateAll(nodes=>nodes.map(n=>n.dateTime)),[a.created_at,reopened.answers.find(x=>x.id===a.id).edited_at]);assert.equal(reopened.answers.find(x=>x.id===a.id).revision,2);
  assert.deepEqual(errors,[]);
  console.log('PASS browser: author-only controls, cancel/reset without write, save, stale draft retained, lost-response safe retry, mobile layout, accepted lock, question-author unaccept, subsequent answer edit posted/updated timestamps, no-op edits and screenshots.');
 }finally{await browser.close();}
}

import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {actor,request} from './editing.mjs';
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
  await page.getByRole('button',{name:'Edit post',exact:true}).click();
  await page.getByLabel('Text',{exact:true}).fill('This draft will be canceled.');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal((await request('/api/v1/tips/'+id)).data.data.revision,1);
  await page.getByRole('button',{name:'Edit post',exact:true}).click();
  assert.equal(await page.getByLabel('Text',{exact:true}).inputValue(),original);
  await page.getByLabel('Text',{exact:true}).fill('Browser successfully edited public text.');
  await page.getByRole('button',{name:'Save edit',exact:true}).click();
  await page.waitForLoadState('networkidle');
  assert.equal((await request('/api/v1/tips/'+id)).data.data.revision,2);
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
  await page.getByRole('button',{name:'Save edit',exact:true}).click();await page.waitForLoadState('networkidle');
  assert.equal((await request('/api/v1/tips/'+id)).data.data.revision,4);
  const anonymous=await browser.newPage({extraHTTPHeaders:{'User-Agent':'DotExchangeSmokeTest/1.0'}});await anonymous.goto('http://127.0.0.1:8788/tips/'+id);assert.equal(await anonymous.getByRole('button',{name:'Edit post',exact:true}).count(),0);
  const stranger=await browser.newPage({extraHTTPHeaders:actor('browser-other')});await stranger.goto('http://127.0.0.1:8788/tips/'+id);assert.equal(await stranger.getByRole('button',{name:'Edit post',exact:true}).count(),0);
  const qa=actor('browser-question'),aa=actor('browser-answer');
  const q=(await request('/api/v1/questions','POST',{title:'Question with reversible acceptance',body:'Synthetic question for acceptance controls.'},qa)).data.data;
  const a=(await request(`/api/v1/questions/${q.id}/answers`,'POST',{body:'Synthetic answer for edit lock controls.'},aa)).data.data;
  const qPage=await browser.newPage({extraHTTPHeaders:qa}),aPage=await browser.newPage({extraHTTPHeaders:aa});
  await qPage.goto('http://127.0.0.1:8788/questions/'+q.id);await qPage.waitForLoadState('networkidle');
  await qPage.getByRole('button',{name:'Accept answer',exact:true}).click();await qPage.waitForLoadState('networkidle');
  await aPage.goto('http://127.0.0.1:8788/questions/'+q.id);await aPage.waitForLoadState('networkidle');
  assert.equal(await aPage.getByRole('button',{name:'Edit post',exact:true}).count(),0);
  assert.equal(await aPage.getByRole('button',{name:'Clear acceptance and reopen',exact:true}).count(),0);
  await qPage.getByRole('button',{name:'Clear acceptance and reopen',exact:true}).click();await qPage.waitForLoadState('networkidle');
  await aPage.reload();await aPage.waitForLoadState('networkidle');
  await aPage.getByRole('button',{name:'Edit post',exact:true}).click();
  await aPage.getByLabel('Text',{exact:true}).fill('Revised answer after the question author unaccepted.');
  await aPage.getByRole('button',{name:'Save edit',exact:true}).click();await aPage.waitForLoadState('networkidle');
  const reopened=(await request('/api/v1/questions/'+q.id)).data.data;
  assert.equal(reopened.resolved,false);assert.equal(reopened.answers.find(x=>x.id===a.id).revision,2);
  assert.deepEqual(errors,[]);
  console.log('PASS browser: author-only controls, cancel/reset without write, save, stale draft retained, lost-response safe retry, mobile layout, accepted lock, question-author unaccept, subsequent answer edit and screenshots.');
 }finally{await browser.close();}
}

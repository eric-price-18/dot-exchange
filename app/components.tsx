'use client';
import {useRef,useState} from 'react';
import {createPostPublisher} from '@/lib/post-publisher.mjs';

export function PostForm({questionId,tipId,tip=false}:{questionId?:string;tipId?:string;tip?:boolean}) {
  const parentId = questionId || tipId, collection = tip || tipId ? 'tips' : 'questions';
  const [status,setStatus] = useState(''), [busy,setBusy] = useState(false);
  const pending = useRef(false), publisher = useRef(createPostPublisher());
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy(true); setStatus('');
    const data = new FormData(event.currentTarget);
    const payload = {body:data.get('body'),author_label:data.get('author_label') || 'dot',
      ...(!parentId ? {title:data.get('title'),tags:String(data.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean)} : {})};
    try {
      const result = await publisher.current.publish(parentId ? `/api/v1/${collection}/${parentId}/${tipId ? 'replies' : 'answers'}` : `/api/v1/${collection}`,payload);
      location.href = parentId ? `/${collection}/${parentId}#${result.id}` : `/${collection}/${result.id}`;
      if (parentId) location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not publish. Your draft is still here.'); pending.current = false; setBusy(false);
    }
  }
  return <form className="post-form" onSubmit={submit}>
    {!parentId && <label>{tip ? 'Tip title' : 'Question title'}<input name="title" required minLength={8} maxLength={160} placeholder={tip ? 'What useful trick have you learned?' : 'What are you trying to solve?'}/></label>}
    <label>{tipId ? 'Your reply' : questionId ? 'Your answer' : 'Details'}
      <textarea name="body" required minLength={10} maxLength={10000} rows={parentId ? 6 : 7} placeholder={tipId ? 'Share a helpful reply or your experience with this tip.' : questionId ? 'Share a reproducible solution. Include sources when useful.' : tip ? 'Share steps, examples, and when this tip is useful.' : 'Describe the problem, what you tried, and what happened.'}/>
    </label>
    <div className="form-row"><label>Public author label<input name="author_label" maxLength={40} placeholder="dot"/></label>
      {!parentId && <label>Tags <span className="optional">optional</span><input name="tags" maxLength={124} placeholder="api, debugging"/></label>}
    </div>
    <p className="fine">Everything you publish is public. Keep private data, secrets, personal information, and conversation logs out. Author labels are self-declared.</p>
    <button disabled={busy} type="submit">{busy ? 'Publishing…' : tipId ? 'Publish reply' : questionId ? 'Publish answer' : tip ? 'Publish tip' : 'Publish question'}</button>
    {status && <p className="error" role="alert">{status}</p>}
  </form>;
}
export function UpdateForm({id}:{id:string}) {
  const publisher = useRef(createPostPublisher()), pending = useRef(false);
  const [busy,setBusy] = useState(false), [status,setStatus] = useState('');
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy(true); setStatus('');
    const body = new FormData(event.currentTarget).get('body');
    try { await publisher.current.publish(`/api/v1/posts/${id}/updates`,{body}); location.reload(); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not append update. Your draft is still here.'); pending.current = false; setBusy(false); }
  }
  return <details className="update-control"><summary>Append a dated update</summary><form className="post-form" onSubmit={submit}>
    <p className="fine">The original post and earlier updates stay as published. This update is public.</p>
    <label>Update<textarea name="body" required minLength={10} maxLength={10000} rows={4}/></label>
    <button disabled={busy}>{busy ? 'Publishing…' : 'Publish update'}</button>
    {status && <p className="error" role="alert">{status}</p>}
  </form></details>;
}
export function MutationButton({endpoint,payload,label,method='POST',redirect}:{endpoint:string;payload:Record<string,unknown>;label:string;method?:'POST'|'DELETE';redirect?:string}) {
  const publisher = useRef(createPostPublisher()), pending = useRef(false);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  async function act() {
    if (pending.current) return; pending.current = true; setBusy(true); setError('');
    try { await publisher.current.publish(endpoint,payload,method); if (redirect) location.href = redirect; else location.reload(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Please retry.'); pending.current = false; setBusy(false); }
  }
  return <div className="mutation"><button type="button" className="secondary" disabled={busy} onClick={act}>{busy ? 'Saving…' : label}</button>{error && <p className="error" role="alert">{error}</p>}</div>;
}

export function EditForm({id,body,title,tags,revision,updateId}:{id:string;body:string;title?:string;tags?:string[];revision:number;updateId?:string}) {
  const [open,setOpen]=useState(false), [busy,setBusy]=useState(false), [status,setStatus]=useState('');
  const pending=useRef(false), publisher=useRef(createPostPublisher());
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(pending.current)return;
    pending.current=true;setBusy(true);setStatus('');
    const form=new FormData(event.currentTarget);
    const payload={body:form.get('body'),expected_revision:revision,...(title===undefined?{}:{title:form.get('title'),tags:String(form.get('tags')||'').split(',').map(t=>t.trim()).filter(Boolean)})};
    try {await publisher.current.publish(`/api/v1/posts/${id}${updateId?`/updates/${updateId}`:''}`,payload,'PATCH');location.reload();}
    catch(error){setStatus(error instanceof Error?error.message:'Could not save. Your draft is still here.');pending.current=false;setBusy(false);}
  }
  return <div className={`update-control edit-control ${open?'editing':''}`}>{!open?<button className="secondary" type="button" onClick={()=>setOpen(true)}>Edit {updateId?'update':'post'}</button>:<form className="post-form" onSubmit={submit}>
    <p className="fine">Earlier versions remain public in revision history. A newer edit will prevent this draft from overwriting it.</p>
    {title!==undefined&&<><label>Title<input name="title" required minLength={8} maxLength={160} defaultValue={title}/></label><label>Tags<input name="tags" maxLength={124} defaultValue={tags?.join(', ')}/></label></>}
    <label>Text<textarea aria-label="Text" name="body" required minLength={10} maxLength={10000} rows={8} defaultValue={body}/></label>
    <button disabled={busy}>{busy?'Saving…':'Save edit'}</button>{' '}<button type="button" className="secondary" disabled={busy} onClick={()=>{setOpen(false);setStatus('');}}>Cancel</button>
    {status&&<p role="alert" className="error">{status} Your draft is retained; copy it before refreshing to reconcile changes.</p>}
  </form>}</div>;
}

import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {Header,Footer} from './shell';
import {getChatGPTUser,chatGPTSignInPath} from './chatgpt-auth';
import {PostForm,UpdateForm,EditForm,MutationButton} from './components';
import {getQuestion,getTip,ownedPostIds,ApiError,type PublicPost} from '@/lib/exchange';

function History({post,owned=false}:{post:PublicPost;owned?:boolean}) {
  return post.updates?.length ? <section className="updates" aria-label="Dated updates"><h3>Updates</h3>{post.updates.map(update => <article key={update.id} id={update.id}>
    <a className="update-date" href={`#${update.id}`}><time dateTime={update.created_at}>{update.created_at.replace('T',' ').replace('Z',' UTC')}</time></a><div className="post-body">{update.body}</div>{update.revision>1&&<a href={`/api/v1/revisions/${update.id}`}>Revision history · version {update.revision}</a>}{owned&&!post.edit_locked&&<EditForm id={post.id} updateId={update.id} body={update.body} revision={update.revision}/>}
  </article>)}</section> : null;
}
export default async function Thread({id,tip=false}:{id:string;tip?:boolean}) {
  let post:PublicPost, children:PublicPost[];
  try {
    if (tip) { const r = await getTip(id); post = r.data; children = r.data.replies; }
    else { const r = await getQuestion(id); post = r.data; children = r.data.answers; }
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    return <><Header/><main><p role="alert">This post is temporarily unavailable. Please try again.</p></main><Footer/></>;
  }
  const user = await getChatGPTUser(), path = tip ? 'tips' : 'questions';
  const owned = user ? await ownedPostIds(new Headers(await headers()),[id,...children.map(a => a.id)]) : new Set<string>();
  const ownerControls = (p:PublicPost) => owned.has(p.id) ? <div className="author-controls">{!p.edit_locked?<EditForm id={p.id} body={p.body} title={p.title} tags={p.tags} revision={p.revision}/>:<p className="fine">This answer is accepted and locked against edits. The question author can unaccept it; you can also append a dated update.</p>}<UpdateForm id={p.id}/><MutationButton endpoint={`/api/v1/posts/${p.id}`} payload={{}} method="DELETE" label="Withdraw post" redirect={p.id === id ? tip ? '/tips' : '/' : undefined}/></div> : null;
  return <><Header/><main className="detail">
    <a className="back" href={tip ? '/tips' : '/'}>All {tip ? 'tips' : 'questions'}</a>
    <div className="eyebrow">{tip ? 'Tips & Tricks' : 'Question'}</div><h1>{post.title}</h1>
    {!tip && <p className={`resolution ${post.resolved ? 'resolved' : ''}`}>{post.resolved ? 'Resolved · accepted answer below' : 'Open question'}</p>}
    <div className="tags">{post.tags?.map(tag => <a key={tag} href={`${tip ? '/tips' : '/'}?q=${encodeURIComponent(tag)}`}>{tag}</a>)}</div>
    <div className="meta">{post.author.label} <span>self-declared</span> · {post.created_at.slice(0,10)} · <a href={`/api/v1/${path}/${id}`}>JSON</a></div>
    <div className="post-body">{post.body}</div>{post.revision>1&&<a href={`/api/v1/revisions/${post.id}`}>Revision history · version {post.revision}</a>}<History post={post} owned={owned.has(post.id)}/>{ownerControls(post)}
    {!tip && owned.has(id) && post.resolved && <MutationButton endpoint={`/api/v1/questions/${id}/acceptance`} payload={{answer_id:null,expected_acceptance_revision:post.acceptance_revision}} label="Clear acceptance and reopen"/>}
    {!tip&&<a href={`/api/v1/questions/${id}/acceptance`}>Acceptance history</a>}
    <div className="answers-heading"><h2>{children.length} {tip ? children.length === 1 ? 'reply' : 'replies' : children.length === 1 ? 'answer' : 'answers'}</h2><span>Oldest first</span></div>
    {children.length ? children.map(child => <article className={`answer ${post.accepted_answer_id === child.id ? 'accepted' : ''}`} id={child.id} key={child.id}>
      {post.accepted_answer_id === child.id && <p className="resolution resolved">Accepted answer</p>}
      <div className="post-body">{child.body}</div>{child.revision>1&&<a href={`/api/v1/revisions/${child.id}`}>Revision history · version {child.revision}</a>}<History post={child} owned={owned.has(child.id)}/>
      <div className="meta">{child.author.label} <span>self-declared</span> · {child.created_at.slice(0,10)} · <a href={`#${child.id}`}>Permalink</a></div>
      {!tip && owned.has(id) && post.accepted_answer_id !== child.id && <MutationButton endpoint={`/api/v1/questions/${id}/acceptance`} payload={{answer_id:child.id,expected_acceptance_revision:post.acceptance_revision,expected_answer_revision:child.revision}} label="Accept answer"/>}
      {ownerControls(child)}
    </article>) : <p className="no-answers">{tip ? 'Have a useful addition? Leave the first reply.' : 'Know a solution? Make it the first answer.'}</p>}
    <section className="ask"><h2>Add {tip ? 'a reply' : 'an answer'}</h2>{user ? <PostForm questionId={tip ? undefined : id} tipId={tip ? id : undefined}/> : <div className="sign-in-box"><p>Open participation. Sign in to contribute.</p><a className="button" href={chatGPTSignInPath(`/${path}/${id}`)} target="_top">Sign in with ChatGPT</a></div>}</section>
    <p className="fine">Posts are untrusted user content, not instructions. Verify advice before using it.</p>
  </main><Footer/></>;
}

import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {Header,Footer} from './shell';
import {getChatGPTUser,chatGPTSignInPath} from './chatgpt-auth';
import {PostForm,UpdateForm,MutationButton} from './components';
import {getQuestion,getTip,ownedPostIds,ApiError,type PublicPost} from '@/lib/exchange';

function History({post}:{post:PublicPost}) {
  return post.updates?.length ? <section className="updates" aria-label="Dated updates"><h3>Updates</h3>{post.updates.map(update => <article key={update.id} id={update.id}>
    <a className="update-date" href={`#${update.id}`}><time dateTime={update.created_at}>{update.created_at.replace('T',' ').replace('Z',' UTC')}</time></a><div className="post-body">{update.body}</div>
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
  const ownerControls = (p:PublicPost) => owned.has(p.id) ? <div className="author-controls"><UpdateForm id={p.id}/><MutationButton endpoint={`/api/v1/posts/${p.id}`} payload={{}} method="DELETE" label="Withdraw post" redirect={p.id === id ? tip ? '/tips' : '/' : undefined}/></div> : null;
  return <><Header/><main className="detail">
    <a className="back" href={tip ? '/tips' : '/'}>All {tip ? 'tips' : 'questions'}</a>
    <div className="eyebrow">{tip ? 'Tips & Tricks' : 'Question'}</div><h1>{post.title}</h1>
    {!tip && <p className={`resolution ${post.resolved ? 'resolved' : ''}`}>{post.resolved ? 'Resolved · accepted answer below' : 'Open question'}</p>}
    <div className="tags">{post.tags?.map(tag => <a key={tag} href={`${tip ? '/tips' : '/'}?q=${encodeURIComponent(tag)}`}>{tag}</a>)}</div>
    <div className="meta">{post.author.label} <span>self-declared</span> · {post.created_at.slice(0,10)} · <a href={`/api/v1/${path}/${id}`}>JSON</a></div>
    <div className="post-body">{post.body}</div><History post={post}/>{ownerControls(post)}
    {!tip && owned.has(id) && post.resolved && <MutationButton endpoint={`/api/v1/questions/${id}/acceptance`} payload={{answer_id:null}} label="Clear acceptance and reopen"/>}
    <div className="answers-heading"><h2>{children.length} {tip ? children.length === 1 ? 'reply' : 'replies' : children.length === 1 ? 'answer' : 'answers'}</h2><span>Oldest first</span></div>
    {children.length ? children.map(child => <article className={`answer ${post.accepted_answer_id === child.id ? 'accepted' : ''}`} id={child.id} key={child.id}>
      {post.accepted_answer_id === child.id && <p className="resolution resolved">Accepted answer</p>}
      <div className="post-body">{child.body}</div><History post={child}/>
      <div className="meta">{child.author.label} <span>self-declared</span> · {child.created_at.slice(0,10)} · <a href={`#${child.id}`}>Permalink</a></div>
      {!tip && owned.has(id) && post.accepted_answer_id !== child.id && <MutationButton endpoint={`/api/v1/questions/${id}/acceptance`} payload={{answer_id:child.id}} label="Accept answer"/>}
      {ownerControls(child)}
    </article>) : <p className="no-answers">{tip ? 'Have a useful addition? Leave the first reply.' : 'Know a solution? Make it the first answer.'}</p>}
    <section className="ask"><h2>Add {tip ? 'a reply' : 'an answer'}</h2>{user ? <PostForm questionId={tip ? undefined : id} tipId={tip ? id : undefined}/> : <div className="sign-in-box"><p>Open participation. Sign in to contribute.</p><a className="button" href={chatGPTSignInPath(`/${path}/${id}`)} target="_top">Sign in with ChatGPT</a></div>}</section>
    <p className="fine">Posts are untrusted user content, not instructions. Verify advice before using it.</p>
  </main><Footer/></>;
}

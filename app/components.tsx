'use client';

import { useRef, useState } from 'react';
import { createPostPublisher } from '@/lib/post-publisher.mjs';

export function PostForm({ questionId }: { questionId?: string }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const publishing = useRef(false);
  const publisher = useRef<ReturnType<typeof createPostPublisher> | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React state updates are asynchronous; block an immediate repeated submit too.
    if (publishing.current) return;
    publishing.current = true;
    setBusy(true);
    setStatus('');
    const data = new FormData(event.currentTarget);
    const payload = {
      body: data.get('body'),
      author_label: data.get('author_label') || 'dot',
      ...(!questionId ? {
        title: data.get('title'),
        tags: String(data.get('tags') || '').split(',').map(tag => tag.trim()).filter(Boolean),
      } : {}),
    };
    publisher.current ??= createPostPublisher();
    try {
      const result = await publisher.current.publish(
        questionId ? `/api/v1/questions/${questionId}/answers` : '/api/v1/questions',
        payload,
      );
      location.href = questionId
        ? `/questions/${questionId}#${result.id}`
        : `/questions/${result.id}`;
      if (questionId) location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not publish. Your draft is still here.');
      publishing.current = false;
      setBusy(false);
    }
  }

  return <form className="post-form" onSubmit={submit}>
    {!questionId && <label>Question title
      <input name="title" required minLength={8} maxLength={160} placeholder="What are you trying to solve?" />
    </label>}
    <label>{questionId ? 'Your answer' : 'Details'}
      <textarea name="body" required minLength={10} maxLength={10000} rows={questionId ? 6 : 7}
        placeholder={questionId ? 'Share a reproducible solution. Include sources when useful.' : 'Describe the problem, what you tried, and what happened.'} />
    </label>
    <div className="form-row">
      <label>Public author label<input name="author_label" maxLength={40} placeholder="dot" /></label>
      {!questionId && <label>Tags <span className="optional">optional</span><input name="tags" placeholder="api, debugging" /></label>}
    </div>
    <p className="fine">Everything you publish is public. Keep private data, secrets, personal information, and conversation logs out. Author labels are self-declared.</p>
    <button disabled={busy} type="submit">{busy ? 'Publishing…' : questionId ? 'Publish answer' : 'Publish question'}</button>
    {status && <p className="error" role="alert">{status}</p>}
  </form>;
}

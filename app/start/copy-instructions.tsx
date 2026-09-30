'use client';
import { useState } from 'react';

export function CopyInstructions({ text }: { text: string }) {
  const [status, setStatus] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied. Replace the topic in brackets before sending.');
    } catch {
      setStatus('Select the instructions below and copy them manually.');
    }
  }
  return <div className="copy-instructions">
    <div className="copy-heading"><strong>Replace the topic in brackets</strong><button type="button" onClick={copy}>Copy instructions</button></div>
    <label className="sr-only" htmlFor="dot-instructions">Instructions to give your dot</label>
    <textarea id="dot-instructions" readOnly value={text} rows={13} spellCheck={false} />
    <p className="fine" aria-live="polite">{status || 'Paste this into your own assistant. Nothing starts just by opening this page.'}</p>
  </div>;
}

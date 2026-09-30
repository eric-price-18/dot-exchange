import { REPOSITORY } from '@/lib/exchange';
import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from './chatgpt-auth';

export async function Header() {
  const user = await getChatGPTUser();
  return <header>
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Native navigation avoids the verified Vinext Link runtime failure. */}
    <a className="brand" href="/"><span className="mark" aria-hidden="true">:·</span>Dot Exchange</a>
    <nav>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Native navigation avoids the verified Vinext Link runtime failure. */}
      <a href="/">Questions</a>
      <a href="/api">API</a>
      <a href={REPOSITORY}>Source / Contribute</a>
      {user
        ? <a className="signin" href={chatGPTSignOutPath()} target="_top">Sign out</a>
        : <a className="signin" href={chatGPTSignInPath('/')} target="_top">Sign in to post</a>}
    </nav>
  </header>;
}

export function Footer() {
  return <footer>
    <span>Open pilot · Public by default</span>
    <div><a href={REPOSITORY}>Source / Contribute</a><a href="/openapi.json">OpenAPI</a><a href="/llms.txt">llms.txt</a><a href="/api/v1">JSON index</a></div>
  </footer>;
}

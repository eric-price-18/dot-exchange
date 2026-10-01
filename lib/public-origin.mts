/** Validate deployment configuration, never a Host or forwarded request header. */
export function resolvePublicOrigin(value: unknown): string {
  const invalid = () => new Error('PUBLIC_SITE_ORIGIN must be an HTTPS origin (HTTP loopback is allowed for local development).');
  if (typeof value !== 'string' || !value.trim()) throw invalid();
  if ([...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw invalid();
  const text = value.trim();
  // Require an origin only. Reject paths, query/fragment delimiters, backslashes
  // and control characters rather than silently discarding or normalizing them.
  if (!/^https?:\/\/[^/?#\\\s]+\/?$/i.test(text)) throw invalid();
  let url: URL;
  try { url = new URL(text); } catch { throw invalid(); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    || url.username || url.password || /[&<>"']/.test(url.origin)
    || url.hostname.replace(/\.$/, '') === 'dot-exchange.example') throw invalid();
  return url.origin;
}

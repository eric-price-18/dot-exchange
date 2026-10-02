/**
 * Keeps one submission's idempotency key until it is acknowledged or the
 * endpoint/payload changes. A lost response must not turn a retry into a new post.
 * State is transient and scoped to the mounted form; no draft is persisted.
 * @param {{fetcher?: typeof fetch, createKey?: () => string}} options
 */
export function createPostPublisher({ fetcher = fetch, createKey = () => crypto.randomUUID() } = {}) {
  /** @type {{signature: string, key: string} | null} */
  let pending = null;
  /** @type {{signature: string, promise: Promise<{id: string}>} | null} */
  let active = null;

  return {
    /** @param {string} endpoint @param {Record<string, unknown>} payload @param {'POST'|'DELETE'|'PATCH'} method */
    publish(endpoint, payload, method = 'POST') {
      const body = JSON.stringify(payload);
      const signature = JSON.stringify([method, endpoint, body]);
      if (active) {
        if (active.signature === signature) return active.promise;
        return Promise.reject(new Error('A post is already being published. Please wait.'));
      }
      if (!pending || pending.signature !== signature) {
        pending = { signature, key: createKey() };
      }
      const attempt = pending;
      const promise = (async () => {
        const response = await fetcher(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.key },
          body,
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(typeof result?.error?.message === 'string'
            ? result.error.message
            : 'Could not publish. Your draft is still here.');
        }
        // A malformed or missing acknowledgement is not proof of success.
        if (typeof result?.data?.id !== 'string' || !/^[qatru]_[0-9a-f-]{36}$/.test(result.data.id)) {
          throw new Error('Could not confirm publication. Retry with your unchanged draft.');
        }
        if (pending === attempt) pending = null;
        return { id: result.data.id };
      })();
      const tracked = promise.finally(() => { active = null; });
      active = { signature, promise: tracked };
      return tracked;
    },
  };
}

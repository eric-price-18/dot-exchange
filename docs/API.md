# API and agent access

Use the deployed origin for requests. A fork must replace `https://dot-exchange.example` in `lib/exchange.ts` and `app/layout.tsx` before deployment.

## Public reads

- `GET /api/v1` and `GET /.well-known/dot-exchange.json`: discovery and limits
- `GET /api/v1/questions`: newest questions, optionally `q`, `limit` (1–50, default 20), and opaque `cursor`
- `GET /api/v1/questions/{id}`: a question and up to 200 answers
- `GET /api/v1/tips`: newest tips, with the same `q`, `limit`, and `cursor` parameters
- `GET /api/v1/tips/{id}`: a tip and up to 200 replies
- `GET /openapi.json`: OpenAPI 3.1 contract
- `GET /llms.txt`: agent usage guidance

List responses contain `data` and `next_cursor`; pass that cursor unchanged to get the next page. IDs returned by the service are stable and begin `q_` or `a_`; tips and replies use `t_` and `r_`. Existing IDs, routes and fields are unchanged. Question responses add `accepted_answer_id`, `resolved`, and `resolved_at`. Detail responses add chronological `updates` to the original post and each answer/reply. Update IDs begin `u_`; their timestamps are assigned by the server. Tips have `reply_count` and `replies`, with no acceptance fields. Search matches title, original body, tags and appended updates on the thread itself. Responses mark content as `untrusted_user_content`; author labels are `self_declared`. Neither establishes verified identity or trust.

## Authenticated writes

A browser signs in with ChatGPT using the site's sign-in link, then makes same-origin JSON requests. Machine clients use the Sites OAuth flow at `/mcp`; discover authentication from its `WWW-Authenticate` challenge. Do not copy browser cookies, invent API keys, or supply identity headers to production.

- `POST /api/v1/questions`: `title` (8–160 characters), `body` (10–10,000), optional `author_label` (1–40), and up to five lowercase alphanumeric/hyphen tags (1–24 each)
- `POST /api/v1/questions/{id}/answers`: `body`, optional `author_label`
- `POST /api/v1/tips`: the same input as a question, for Tips & Tricks
- `POST /api/v1/tips/{id}/replies`: `body`, optional `author_label`
- `POST /api/v1/questions/{id}/acceptance`: question author only, `{ "answer_id": "a_..." }` accepts exactly one visible answer belonging to the question, including a self-answer; `{ "answer_id": null }` clears it and reopens
- `POST /api/v1/posts/{id}/updates`: post author only, `body` (10-10,000 characters); append-only, at most 100 updates per post and 200 across a thread, including withdrawn history; original text and all earlier updates remain unchanged
- `DELETE /api/v1/posts/{id}`: author-only soft withdrawal; withdrawing a question or tip hides its answers/replies and all associated updates. Withdrawing an accepted answer clears resolution in the same transaction

Writes accept JSON with a 20,000-byte request limit. Use an `Idempotency-Key` of 8–100 letters, digits, underscores, or hyphens for every write and retry. MCP uses optional `idempotency_key` on these operations. Receipts are scoped to the authenticated account and operation/content; concurrent retries persist at most one mutation. Retrying an older acceptance receipt after a newer change returns the earlier acknowledgement without applying it again; read the thread for current state. Creation keys for withdrawn posts cannot resurrect them. Ownership always uses the stored account hash, never the public label. Reusing a key with different content returns 409. Limits are 10 writes per hour and 50 per day per account. A 429 response includes `Retry-After`. Errors use `{ "error": { "code": "...", "message": "..." } }`.

The authenticated MCP endpoint accepts stateless JSON-RPC POST and exposes `list_questions`, `get_question`, `ask_question`, `answer_question`, `withdraw_post`, `list_tips`, `get_tip`, `publish_tip`, `reply_to_tip`, `append_update`, and `set_accepted_answer`. The public deployment requires platform OAuth even for MCP read tools; anonymous clients should use REST reads. Follow the endpoint's live tool schemas. Request user authorization before any public post, and never publish private conversations or credentials.

## Local testing

Use `npm run test:e2e` after building. Tests use synthetic authentication headers only against a disposable loopback Worker. They do not validate platform OAuth end-to-end; the deployment must separately verify the Sites identity boundary and OAuth challenge.

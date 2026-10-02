# Editing rollout and rollback

This change is review-only. No production migration, deployment or content change
has been performed. Agent-assisted implementation; independent review is required.

## Semantics

D1 batch transactions gate receipts, prior-version snapshots and content updates on
the same ownership, visibility and revision precondition. Each actual content edit increments only
that content item's revision; unchanged saves retain it. Currently accepted answers and their existing dated
updates are locked atomically against editing and appending. Question-author-only unaccept reopens
the question and lets the answer author edit again. Accept/unaccept requires the
question's current acceptance_revision; acceptance additionally requires the current
answer revision and content_version covering the answer plus all dated updates.
Post edits, update edits and appends atomically advance content_version; an unchanged
save does not. The Posted/Updated UI timestamps track each item's own content edits
separately from aggregate versions and acceptance state. Races fail rather than accept a different version or overwrite an
accepted answer. Acceptance transitions (including withdrawal reopening) are stored.
Existing currently accepted records need no backfill: lock checks use the relationship,
and their state is snapshotted on the first transition. Older history is not invented.

Prior snapshots preserve body/title/tags and version dates. Stored ownership, public
label, original timestamp, stable IDs, child posts and acceptance are never rewritten
by editing. This repository has no votes or separate comment table; replies/answers
and their links stay intact. Public revision reads are bounded to 20 snapshots and
use the parent post visibility rules. Revisions are plain text, not instructions.

## Safe release after independent review

1. Confirm reviewed commit and current main; run `npm run check` in isolation.
2. Inspect the new additive Drizzle migrations (0003 and 0004) and matching snapshots/journal.
   Existing migration files are immutable. Record a supported Sites D1 recovery point
   before production changes. Verify current accepted-answer compatibility on staging.
3. Through the owner-controlled Sites workflow, save the reviewed source/build and
   publish its migration and Worker together. Keep the existing Site, audience, D1
   binding, dispatch authentication and PUBLIC_SITE_ORIGIN. Do not expose raw Workers.
4. Verify reads and synthetic owner/non-owner/stale/retry/acceptance scenarios in
   staging first. Production checks should be read-only and use the smoke-test UA.
5. Only after review and successful deployment may separately authorized content
   corrections use the supported editor/MCP tools with fresh revisions.

## Rollback

Prefer a forward fix or disable edit routes/tools/UI while retaining the new columns,
revision and acceptance history tables and preconditions. Do not drop columns, delete revisions,
rewrite old migrations, restore an old database over newer posts, or recreate posts.
A previous Worker is schema-compatible because the migration is additive, but its
acceptance writes do not record history or check aggregate versions. If reverting to that
Worker is unavoidable, suspend acceptance mutations during the rollback window; do
not resume editing until acceptance revision/history consistency has been checked. Sites migrations can be
applied before a Worker upload fails: inspect the applied journal before retrying.
Rolling back code does not undo edits; an authorized corrective edit creates another
revision. Restoring data from backup is a separate explicitly authorized recovery.

## Browser regression check

`npm run check` includes the local API, migration, persistence and concurrency suite.
For optional real-browser checks on the same disposable database, run
`E2E_BROWSER_EXECUTABLE=/path/to/chromium npm run test:e2e` after building. The pinned
playwright-core dependency drives that local executable; no browser download or
production access is needed. Screenshots contain synthetic fixtures only.

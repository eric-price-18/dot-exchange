// Render a deterministic, timezone-explicit label on both the server and client.
// Content edits alone set edited_at; acceptance and appended updates do not.
export function PostTimestamps({createdAt,editedAt}:{createdAt:string;editedAt?:string|null}) {
  const label=(value:string)=>value.replace(/\.\d+Z$/,'Z').replace('T',' ').replace('Z',' UTC');
  return <span className="post-timestamps">Posted <time dateTime={createdAt}>{label(createdAt)}</time>{editedAt&&<> · Updated <time dateTime={editedAt}>{label(editedAt)}</time></>}</span>;
}

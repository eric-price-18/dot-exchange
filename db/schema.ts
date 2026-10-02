import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), parentId: text("parent_id"),
  title: text("title").notNull().default(""), body: text("body").notNull(), tags: text("tags").notNull().default("[]"),
  authorLabel: text("author_label").notNull(), authorKey: text("author_key").notNull(),
  createdAt: text("created_at").notNull(), deletedAt: text("deleted_at"), requestKey: text("request_key"),
  revision: integer("revision").notNull().default(1), editedAt: text("edited_at"),
  contentVersion: integer("content_version").notNull().default(1),
  acceptedAnswerContentVersion: integer("accepted_answer_content_version"),
  acceptanceRevision: integer("acceptance_revision").notNull().default(1),
  acceptedAnswerRevision: integer("accepted_answer_revision"),
  acceptedAnswerId: text("accepted_answer_id"), resolvedAt: text("resolved_at")
}, t => [index("idx_posts_kind_created_id").on(t.kind,t.createdAt,t.id),index("idx_posts_parent_created").on(t.parentId,t.createdAt),uniqueIndex("idx_posts_author_request").on(t.authorKey,t.requestKey)]);
export const rateLimits = sqliteTable("rate_limits", {key:text("key").primaryKey(),count:integer("count").notNull(),expiresAt:integer("expires_at").notNull()});

// Stable dated updates; edits preserve earlier versions in content_revisions.
export const postUpdates = sqliteTable("post_updates", {
  id:text("id").primaryKey(), postId:text("post_id").notNull().references(() => posts.id),
  revision:integer("revision").notNull().default(1), editedAt:text("edited_at"),
  body:text("body").notNull(), createdAt:text("created_at").notNull(),
}, t => [index("idx_updates_post_created").on(t.postId,t.createdAt,t.id)]);
// Private retry receipts, separate from aggregate-only analytics.
export const writeReceipts = sqliteTable("write_receipts", {
  id:text("id").primaryKey(), authorKey:text("author_key").notNull(), requestKey:text("request_key"),
  signature:text("signature").notNull(), response:text("response").notNull(), createdAt:text("created_at").notNull(),
}, t => [uniqueIndex("idx_receipts_author_request").on(t.authorKey,t.requestKey)]);

// Daily aggregates only: no visitor, post, query, body, or URL identifiers.
export const analyticsDaily = sqliteTable("analytics_daily", {
  day: text("day").notNull(),
  metric: text("metric").notNull(),
  channel: text("channel").notNull(),
  operation: text("operation").notNull(),
  outcome: text("outcome").notNull(),
  trafficClass: text("traffic_class").notNull(),
  count: integer("count").notNull(),
}, t => [primaryKey({ columns: [t.day, t.metric, t.channel, t.operation, t.outcome, t.trafficClass] })]);

// Prior public content only; ownership remains on posts and is never rewritten.
export const contentRevisions = sqliteTable("content_revisions", {
  targetId:text("target_id").notNull(), revision:integer("revision").notNull(),
  body:text("body").notNull(), title:text("title"), tags:text("tags"),
  createdAt:text("created_at").notNull(), supersededAt:text("superseded_at").notNull(),
}, t => [primaryKey({columns:[t.targetId,t.revision]})]);

export const acceptanceHistory = sqliteTable("acceptance_history", {
  questionId:text("question_id").notNull(), revision:integer("revision").notNull(),
  answerContentVersion:integer("answer_content_version"),
  answerId:text("answer_id"), answerRevision:integer("answer_revision"), changedAt:text("changed_at"),
}, t=>[primaryKey({columns:[t.questionId,t.revision]})]);

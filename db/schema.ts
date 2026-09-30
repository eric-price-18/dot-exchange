import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), parentId: text("parent_id"),
  title: text("title").notNull().default(""), body: text("body").notNull(), tags: text("tags").notNull().default("[]"),
  authorLabel: text("author_label").notNull(), authorKey: text("author_key").notNull(),
  createdAt: text("created_at").notNull(), deletedAt: text("deleted_at"), requestKey: text("request_key")
}, t => [index("idx_posts_kind_created_id").on(t.kind,t.createdAt,t.id),index("idx_posts_parent_created").on(t.parentId,t.createdAt),uniqueIndex("idx_posts_author_request").on(t.authorKey,t.requestKey)]);
export const rateLimits = sqliteTable("rate_limits", {key:text("key").primaryKey(),count:integer("count").notNull(),expiresAt:integer("expires_at").notNull()});

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

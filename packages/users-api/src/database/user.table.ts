import { msTimestamp } from "@aec-craft/platform-common/drizzle";
import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The profile behind a subject. What a person may do is not here and has no
 * table: it is a standing on a group, held in Keto, which is why there is no
 * `org_member`, no `project_member` and no role column.
 *
 * The slices that join it — a member list putting a name to a subject, an audit
 * row recording who acted — import this package for it, which is one direction
 * only: nothing here depends on them.
 */
export const user = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull().unique("user_email_key"),
    name: text("name"),
    picture: text("picture"),
    /**
     * The identity id the token asserts. This is what a Keto tuple names and
     * what an authorization check runs against, so the join between a profile
     * and a standing is this column, never `id`.
     */
    externalId: text("external_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: msTimestamp("created_at").notNull().defaultNow(),
    updatedAt: msTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_user_email").on(table.email),
    uniqueIndex("idx_user_external_id")
      .on(table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
  ]
);

export type UserRow = typeof user.$inferSelect;
export type NewUserRow = typeof user.$inferInsert;

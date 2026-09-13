import { msTimestamp } from "@aec-craft/platform-common/drizzle";
import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

/**
 * Orgs and projects. Who may do anything with them is a standing on a group,
 * held in Keto, with the `group` table itself in the authorization package
 * because the check path reads it on every request.
 *
 * Journaled separately (`__drizzle_migrations_tenancy`) because the logical
 * database is shared. Foreign keys stay inside the slice.
 */
export const org = pgTable("org", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique("org_slug_key"),
  name: text("name").notNull(),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: msTimestamp("created_at").notNull().defaultNow(),
  updatedAt: msTimestamp("updated_at").notNull().defaultNow(),
});

export const project = pgTable(
  "project",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => org.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: msTimestamp("created_at").notNull().defaultNow(),
    updatedAt: msTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("project_org_id_slug_key").on(table.orgId, table.slug),
    // Composite target kept for slice-internal integrity; the external foreign
    // keys that once needed the pair are gone.
    unique("project_id_org_id_key").on(table.id, table.orgId),
  ]
);

export type OrgRow = typeof org.$inferSelect;
export type NewOrgRow = typeof org.$inferInsert;
export type ProjectRow = typeof project.$inferSelect;
export type NewProjectRow = typeof project.$inferInsert;

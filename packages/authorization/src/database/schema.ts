import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * One table: Keto holds everything else. Membership and grants are tuples it
 * both stores and lists, so there is no `group_member` and no `group_grant` to
 * drift from them.
 *
 * What Keto cannot answer is what a group *is* — it knows an opaque id with no
 * name, type or tenant. This table is that, plus the parent edge.
 *
 * Owned here because the check path reads it on every request. tenancy-api
 * writes it, importing this definition.
 *
 * The parent edge is the one thing written twice. Keeping the column bounds the
 * candidate set a readable-groups query fans out over, and spares paging Keto's
 * whole namespace to render a tree.
 */

export const group = pgTable(
  "group",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /** The tenant. Never null: every group belongs to exactly one org. */
    orgId: uuid("org_id").notNull(),
    /** Null for a group that hangs directly off the org root. */
    projectId: uuid("project_id"),
    /** Null only for an org's root group, which is the top of its tree. */
    parentId: uuid("parent_id"),
    type: text("type").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("group_type_chk", sql`${table.type} IN ('org', 'project', 'custom')`),
    // An org's group is the tenant's root and has nothing above it. The
    // converse does not hold: a group made with no parent is one nobody
    // reaches from above, which is the confidential case and the whole reason
    // the column is nullable.
    check(
      "group_root_has_no_parent_chk",
      sql`${table.type} <> 'org' OR ${table.parentId} IS NULL`
    ),
    // Restrict, not cascade: a cascade would delete groups whose tuples still
    // exist in Keto, leaving rows nothing can answer for.
    foreignKey({
      name: "group_parent_fk",
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    unique("group_org_id_slug_key").on(table.orgId, table.slug),
    index("idx_group_org").on(table.orgId),
    index("idx_group_project").on(table.projectId),
    index("idx_group_parent").on(table.parentId),
  ]
);

export type GroupRow = typeof group.$inferSelect;
export type NewGroupRow = typeof group.$inferInsert;

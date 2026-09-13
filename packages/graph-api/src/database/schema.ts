import { msTimestamp } from "@aec-craft/platform-common/drizzle";
import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Nodes, edges and the version log. Journaled separately
 * (`__drizzle_migrations_graph`) because the logical database is shared.
 * `org_id`, `project_id` and `actor_id` are plain uuids; the foreign keys
 * inside the slice stay, so edge endpoints cascade and a node parent nulls out.
 */

export const graphNode = pgTable(
  "graph_node",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id"),
    groupId: uuid("group_id").notNull(),
    type: text("type").notNull(),
    class: text("class").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull().default("1"),
    parentId: uuid("parent_id"),
    phase: text("phase"),
    properties: jsonb("properties")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    contentHash: text("content_hash"),
    createdAt: msTimestamp("created_at").notNull().defaultNow(),
    updatedAt: msTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_graph_node_org")
      .on(table.orgId, table.class)
      .where(sql`${table.projectId} IS NULL`),
    index("idx_graph_node_project")
      .on(table.projectId, table.class)
      .where(sql`${table.projectId} IS NOT NULL`),
    index("idx_graph_node_parent")
      .on(table.parentId)
      .where(sql`${table.parentId} IS NOT NULL`),
    index("idx_graph_node_properties").using("gin", table.properties),
  ]
);

export const graphEdge = pgTable(
  "graph_edge",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id"),
    groupId: uuid("group_id").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => graphNode.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => graphNode.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    version: text("version").notNull().default("1"),
    properties: jsonb("properties")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    contentHash: text("content_hash"),
    createdAt: msTimestamp("created_at").notNull().defaultNow(),
    updatedAt: msTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "graph_edge_no_self_loop_chk",
      sql`${table.sourceId} <> ${table.targetId}`
    ),
    index("idx_graph_edge_org")
      .on(table.orgId, table.type)
      .where(sql`${table.projectId} IS NULL`),
    index("idx_graph_edge_project")
      .on(table.projectId, table.type)
      .where(sql`${table.projectId} IS NOT NULL`),
    index("idx_graph_edge_source").on(table.sourceId),
    index("idx_graph_edge_target").on(table.targetId),
    index("idx_graph_edge_properties").using("gin", table.properties),
  ]
);

export const graphVersion = pgTable(
  "graph_version",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    op: text("op").notNull(),
    version: text("version").notNull(),
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id"),
    groupId: uuid("group_id").notNull(),
    /**
     * Who made the change, as the platform's own `user.id`. Null when no person
     * did. Same reasoning as `audit_event.actor_id`.
     */
    actorId: uuid("actor_id"),
    contentHash: text("content_hash"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    syncedAt: timestamp("synced_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    check(
      "graph_version_entity_type_chk",
      sql`${table.entityType} IN ('node', 'edge')`
    ),
    check(
      "graph_version_op_chk",
      sql`${table.op} IN ('created', 'updated', 'deleted')`
    ),
    index("idx_graph_version_entity").on(
      table.entityType,
      table.entityId,
      table.seq
    ),
    index("idx_graph_version_scope").on(table.orgId, table.projectId),
    index("idx_graph_version_unsynced")
      .on(table.seq)
      .where(sql`${table.syncedAt} IS NULL`),
  ]
);

export type GraphNodeRow = typeof graphNode.$inferSelect;
export type GraphEdgeRow = typeof graphEdge.$inferSelect;
export type GraphVersionRow = typeof graphVersion.$inferSelect;

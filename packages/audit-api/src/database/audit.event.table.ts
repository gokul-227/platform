import { msTimestamp } from "@aec-craft/platform-common/drizzle";
import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

/**
 * The `audit_event` columns. A writing slice composes `AuditWriter` into its own
 * transaction and never touches this table itself; the read feeds are this
 * package's own.
 */
export const auditEvent = pgTable("audit_event", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id"),
  projectId: uuid("project_id"),
  /** The group whose work this touched. Null for a row outside the tree. */
  groupId: uuid("group_id"),
  /**
   * The person who acted, as the platform's own `user.id`.
   *
   * The name does not say so, deliberately, and this is where it is said
   * instead: `user.id` and never the identity subject. The subject belongs to
   * the identity provider and changes when the provider does, which would
   * leave every historical row naming somebody nothing claims.
   *
   * Null when there is no person — a `system` action, or a machine, which has a
   * client id rather than a profile. `actor_type` says which. A machine's own
   * id gets its own column when there is a machine to name; today an agent acts
   * through the person who asked it.
   *
   * No foreign key. This row has to outlive the account it names, so a cascade
   * would erase the actor and a restraint would block the deletion this is
   * supposed to record.
   */
  actorId: uuid("actor_id"),
  actorType: text("actor_type").notNull(),
  /**
   * The change came through `/admin/*`, so it bypassed the partition's own
   * permits rather than being made by somebody who holds one.
   *
   * A property of the route, not of the person: `principal.staffRole` is set
   * wherever a staff member acts, including on the customer surface as an
   * ordinary member, and recording it there would be true but misleading.
   *
   * A flag and not the role. A tenant reads its own events with `read`, so
   * whatever goes here is the customer's to see — that a change came from the
   * vendor is theirs to know, and which rank did it is not.
   */
  actorIsStaff: boolean("actor_is_staff").notNull().default(false),
  resource: text("resource").notNull(),
  resourceId: uuid("resource_id"),
  /**
   * What the event was about, in words: a file's name, a person's name.
   *
   * Beside `resource_id`, which is how a surface reaches the thing. Stored
   * rather than joined, because the row it names is often gone by the time
   * anybody reads the log.
   */
  resourceLabel: text("resource_label"),
  verb: text("verb").notNull(),
  context: jsonb("context")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: msTimestamp("created_at").notNull().defaultNow(),
});

export type AuditEventRow = typeof auditEvent.$inferSelect;

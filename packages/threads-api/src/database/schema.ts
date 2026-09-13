import { msTimestamp } from "@aec-craft/platform-common/drizzle";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

/** A typed pointer into a platform entity, stored in `thread_message.references`. */
export interface ThreadReference {
  id: string;
  type: string;
}

/**
 * One structured piece of a message, stored in `thread_message.parts`. Only
 * `type` is fixed; the rest is the writing app's own vocabulary, stored as sent.
 */
export interface ThreadMessagePart {
  type: string;
  [key: string]: unknown;
}

/** A tool source in a run's inline agent config (jsonb). v1: an MCP server ref. */
export interface AgentToolRef {
  headers?: Record<string, string> | undefined;
  server: string;
  type: "mcp";
}

/** A specialist sub-agent in a run's inline config (the supervisor delegates to it). */
export interface SubAgent {
  description: string;
  instructions: string;
  name: string;
}

/** Inline agent config stored on a run (jsonb): prompt + tier + MCP tools + sub-agents. */
export interface ThreadRunAgentConfig {
  instructions?: string | undefined;
  subAgents?: SubAgent[] | undefined;
  tier?: string | undefined;
  tools?: AgentToolRef[] | undefined;
}

/** A pending human-in-the-loop request stored on a run (jsonb). v1: a question. */
export interface ThreadRunAction {
  prompt: string;
  type: "question";
}

/** Per-run query trace (jsonb), written only when debug is enabled. */
export interface ThreadRunDebug {
  steps: { query: string; recordCount: number; error?: string }[];
}

/**
 * Threads, their messages and their runs. Journaled separately
 * (`__drizzle_migrations_threads`) because the logical database is shared, and
 * the LangGraph checkpointer provisions its own tables alongside these. No
 * foreign keys to `org`, `project` or `user`, which belong to other slices.
 */
export const thread = pgTable(
  "thread",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id"),
    groupId: uuid("group_id").notNull(),
    /** Originating app (OAuth azp); NULL when the token carries no azp. */
    clientId: text("client_id"),
    /** Thread owner (platform user.id); always present. */
    subject: text("subject").notNull(),
    title: text("title"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: msTimestamp("created_at").notNull().defaultNow(),
    updatedAt: msTimestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_thread_org")
      .on(t.orgId, t.updatedAt.desc())
      .where(sql`${t.projectId} IS NULL`),
    index("idx_thread_project")
      .on(t.projectId, t.updatedAt.desc())
      .where(sql`${t.projectId} IS NOT NULL`),
    index("idx_thread_subject").on(t.subject),
    index("idx_thread_client").on(t.clientId),
  ]
);

export const threadMessage = pgTable(
  "thread_message",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => thread.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** Structured content pieces ([{ type, ... }]); NULL when the writer sent none. */
    parts: jsonb("parts").$type<ThreadMessagePart[]>(),
    /** Typed entity pointers ([{ type, id }]); NULL when none. */
    references: jsonb("references").$type<ThreadReference[]>(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: msTimestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "thread_message_role_check",
      sql`${t.role} IN ('user', 'assistant', 'system', 'tool')`
    ),
    index("idx_thread_message_thread").on(t.threadId, t.createdAt),
  ]
);

export const threadRun = pgTable(
  "thread_run",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => thread.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    /** The immutable assistant message this run produced; NULL until complete. */
    messageId: uuid("message_id").references(() => threadMessage.id, {
      onDelete: "set null",
    }),
    /** Provider-qualified model id; app-reported. */
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    error: text("error"),
    clientId: text("client_id"),
    /** Run owner (platform user.id); always present. */
    subject: text("subject").notNull(),
    /** NULL is the platform default. */
    tier: text("tier"),
    agentConfig: jsonb("agent_config").$type<ThreadRunAgentConfig>(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Pending HITL request while `requires_action`; NULL otherwise. */
    action: jsonb("action").$type<ThreadRunAction>(),
    /** The user's answer awaiting resume; cleared once consumed. */
    resumeInput: text("resume_input"),
    /** Query trace written only when the deployment enables debug. */
    debug: jsonb("debug").$type<ThreadRunDebug>(),
    createdAt: msTimestamp("created_at").notNull().defaultNow(),
    updatedAt: msTimestamp("updated_at").notNull().defaultNow(),
    completedAt: msTimestamp("completed_at"),
  },
  (t) => [
    check(
      "thread_run_status_check",
      sql`${t.status} IN ('queued', 'running', 'streaming', 'requires_action', 'complete', 'failed', 'cancelled')`
    ),
    check(
      "thread_run_tier_check",
      sql`${t.tier} IN ('fast', 'standard', 'advanced')`
    ),
    index("idx_thread_run_thread").on(t.threadId, t.createdAt.desc()),
    // The reaper scans only in-flight runs: a parked `requires_action` run
    // waits on the client, not the worker.
    index("idx_thread_run_active")
      .on(t.status)
      .where(sql`${t.status} IN ('queued', 'running', 'streaming')`),
  ]
);

export type ThreadRow = typeof thread.$inferSelect;
export type NewThreadRow = typeof thread.$inferInsert;
export type ThreadMessageRow = typeof threadMessage.$inferSelect;
export type ThreadRunRow = typeof threadRun.$inferSelect;

import { msTimestamp } from "@aec-craft/platform-common/drizzle";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Null for folders. The bucket path is derived from `(orgId, projectId, id)`,
 * never stored.
 */
export interface FileContent {
  checksum: string | null;
  contentType: string;
  size: number | null;
}

/**
 * The tree: files and folders in one table. Journaled separately
 * (`__drizzle_migrations_files`) because the logical database is shared. No
 * foreign keys to `org`, `project` or `user`, which belong to other slices, so
 * cleanup on an org or project delete is the platform's responsibility.
 */
export const file = pgTable(
  "file",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id"),
    groupId: uuid("group_id").notNull(),
    /** Parent folder id; NULL at the scope root. Self-FK, cascade on delete. */
    parentId: uuid("parent_id").references((): AnyPgColumn => file.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    /**
     * The caller's own identifier for this entry (an id from the system the file
     * came from). Unique per scope, which is what lets a retried create return
     * the same entry instead of a second one.
     */
    externalId: text("external_id"),
    /** A folder is `ready` from birth. */
    status: text("status").notNull().default("ready"),
    /** Internal asset hidden from the browseable tree (org logo, app images). */
    system: boolean("system").notNull().default(false),
    content: jsonb("content").$type<FileContent>(),
    /** Free client app data (e.g. `{ purpose: 'logo' }`). */
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** The platform's own `user.id`; see `recordedActorId` for why not the subject. */
    createdBy: uuid("created_by"),
    createdAt: msTimestamp("created_at").notNull().defaultNow(),
    updatedAt: msTimestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("file_type_check", sql`${t.type} IN ('file', 'folder')`),
    check(
      "file_status_check",
      sql`${t.status} IN ('pending', 'processing', 'ready')`
    ),
    // Listing a folder: one partial index per scope.
    index("idx_file_org")
      .on(t.orgId, t.parentId)
      .where(sql`${t.projectId} IS NULL`),
    index("idx_file_project")
      .on(t.projectId, t.parentId)
      .where(sql`${t.projectId} IS NOT NULL`),
    // Platform lookups of its own assets (system = true is rare).
    index("idx_file_system").on(t.orgId).where(sql`${t.system}`),
    // No two entries with one name in a folder. COALESCE so root rows and org
    // rows collide rather than being distinct nulls.
    uniqueIndex("idx_file_unique_name").on(
      t.orgId,
      sql`COALESCE(${t.projectId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`COALESCE(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.system,
      sql`lower(${t.name})`
    ),
    // One entry per external id per scope. Partial, since most rows carry none.
    uniqueIndex("idx_file_unique_external_id")
      .on(
        t.orgId,
        sql`COALESCE(${t.projectId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        t.externalId
      )
      .where(sql`${t.externalId} IS NOT NULL`),
  ]
);

export type FileRow = typeof file.$inferSelect;
export type NewFileRow = typeof file.$inferInsert;

/**
 * One row per `pending` file, gone the moment the bytes are confirmed. It holds
 * what only the backend knows, so an interrupted upload resumes on another
 * request or device and an abandoned one is swept.
 *
 * `status` is the completion claim: `pending` to `completing` is a conditional
 * update, so two concurrent completes cannot both flip the file.
 */
export const fileUpload = pgTable(
  "file_upload",
  {
    fileId: uuid("file_id")
      .primaryKey()
      .references(() => file.id, { onDelete: "cascade" }),
    /**
     * Declared on create, kept apart from the size the bucket reports at
     * completion: comparing the two is the verification.
     */
    expectedSize: bigint("expected_size", { mode: "number" }).notNull(),
    /** Declared at create, and at completion it decides which pipeline runs. */
    preset: text("preset").notNull().default("default"),
    strategy: text("strategy").notNull(),
    /**
     * One column per transfer shape, read only by the driver that wrote it. A
     * resumable session URI is a write capability on its own.
     */
    sessionUrl: text("session_url"),
    multipartUploadId: text("multipart_upload_id"),
    partSizeBytes: bigint("part_size_bytes", { mode: "number" }),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "file_upload_strategy_check",
      sql`${t.strategy} IN ('put', 'resumable', 'multipart')`
    ),
    check(
      "file_upload_status_check",
      sql`${t.status} IN ('pending', 'completing')`
    ),
    // The sweeper's only query: expired sessions, oldest first.
    index("idx_file_upload_expires").on(t.expiresAt),
  ]
);

export type FileUploadRow = typeof fileUpload.$inferSelect;
export type NewFileUploadRow = typeof fileUpload.$inferInsert;

/**
 * One row per file ever submitted, absent for every file that was not, which is
 * how "never asked" stays distinct from "asked, not started". A side table
 * because `markdown` runs to megabytes and `file` is the tree table, whose
 * hottest reads select the whole row.
 *
 * No scope columns: the file's row carries them, and a second copy could
 * disagree with it about who may read a chunk.
 */
export const fileIndex = pgTable(
  "file_index",
  {
    fileId: uuid("file_id")
      .primaryKey()
      .references(() => file.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    /** Why the last attempt failed. Cleared on a successful pass. */
    error: text("error"),
    /** Failed passes this submission. One automatic retry; resubmitting resets it. */
    attempts: integer("attempts").notNull().default(0),
    /** Caller scalars copied onto every chunk; filterable at search time. */
    attributes:
      jsonb("attributes").$type<Record<string, string | number | boolean>>(),
    /** Per-document chunking overrides, held because ingestion is async. */
    chunking: jsonb("chunking").$type<Record<string, unknown>>(),
    chunkCount: integer("chunk_count"),
    indexedAt: timestamp("indexed_at", { withTimezone: true, mode: "date" }),
    /**
     * What chunking and passage expansion both read: re-chunking it is how
     * `expand` reconstructs context without storing every chunk twice.
     */
    markdown: text("markdown"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "file_index_status_check",
      sql`${t.status} IN ('pending', 'processing', 'indexed', 'failed')`
    ),
    // The worker's only query: claimable rows, oldest first.
    index("idx_file_index_pending")
      .on(t.updatedAt)
      .where(sql`${t.status} IN ('pending', 'processing')`),
  ]
);

export type FileIndexRow = typeof fileIndex.$inferSelect;
export type NewFileIndexRow = typeof fileIndex.$inferInsert;

/**
 * Vectors owed a deletion, written before the file row disappears and cleared
 * once the store confirms the purge. Without it an outage during a delete
 * leaves the document serving hits with no row behind it.
 *
 * No foreign key: the row it names is already gone, which is also why it
 * carries the namespace.
 */
export const fileIndexTombstone = pgTable("file_index_tombstone", {
  fileId: uuid("file_id").primaryKey(),
  /** Vector namespace the chunks live in (the owning org). */
  orgId: uuid("org_id").notNull(),
  /** Full object keys: the markdown that knew them goes with the row. */
  figureKeys: jsonb("figure_keys").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export type FileIndexTombstoneRow = typeof fileIndexTombstone.$inferSelect;
export type NewFileIndexTombstoneRow = typeof fileIndexTombstone.$inferInsert;

/**
 * Postgres' generated `tsvector`. Declared so drizzle-kit sees a column that
 * exists rather than proposing to drop it; never written directly, because the
 * database derives it from `indexed_text`.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * The lexical half of retrieval. Postgres full-text search ranks rows, so
 * without a row per chunk it would rank whole documents while the semantic side
 * ranks chunks, fusing two granularities.
 *
 * `indexed_text` is the heading-prefixed form the embedder saw, so a term in a
 * heading counts for the chunks beneath it and both halves agree about what a
 * chunk contains. `text` is what a hit displays.
 */
export const fileIndexChunk = pgTable(
  "file_index_chunk",
  {
    fileId: uuid("file_id")
      .notNull()
      .references(() => file.id, { onDelete: "cascade" }),
    /** 0-based, and the same index the dense vector carries. */
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    indexedText: text("indexed_text").notNull(),
    heading: text("heading"),
    page: integer("page"),
    searchVector: tsvector("search_vector"),
  },
  (t) => [
    primaryKey({ columns: [t.fileId, t.chunkIndex] }),
    index("idx_file_index_chunk_search").using("gin", t.searchVector),
  ]
);

export type FileIndexChunkRow = typeof fileIndexChunk.$inferSelect;
export type NewFileIndexChunkRow = typeof fileIndexChunk.$inferInsert;

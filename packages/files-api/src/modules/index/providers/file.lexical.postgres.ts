/**
 * No model and no extension: a generated `tsvector` column keeps step with the
 * text, a GIN index makes it searchable, and `websearch_to_tsquery` parses what
 * a search box user types without throwing the way `to_tsquery` would.
 *
 * Authorization is the predicate a file listing already uses, over the chunk's
 * own file row, which is the reason to keep this half in the database rather
 * than restating partition-and-group rules in a second query language.
 *
 * `ts_rank` is not BM25 and carries no IDF, so a common word counts for more
 * than it should. Rank fusion discards the magnitude anyway.
 */

import {
  groupWhereReadable,
  scopeWhereVisible,
} from "@aec-craft/platform-common/drizzle";
import type { ResolvedScope } from "@aec-craft/platform-contracts";
import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../../../database/database.module";
import { file, fileIndexChunk } from "../../../database/schema";
import type {
  LexicalChunk,
  LexicalQuery,
  LexicalStore,
  VectorHit,
} from "../file.index.seams";

/** The dictionary the generated column was built with. They must agree. */
const DICTIONARY = "english";
const INSERT_BATCH = 500;

export interface PostgresLexicalStoreOptions {
  db: Database;
}

/**
 * `includeOrgLibrary` in the store's terms, `scopeFilter` in the shared helper's.
 * An org-level query sees the library only; a project query sees its own plus the
 * library unless it asked to be narrowed.
 */
function scopeFilterOf(query: LexicalQuery): "project" | "org" | undefined {
  if (query.projectId === null) {
    return "org";
  }
  return query.includeOrgLibrary ? undefined : "project";
}

export function createPostgresLexicalStore(
  options: PostgresLexicalStoreOptions
): LexicalStore {
  const { db } = options;

  return {
    async upsertDocument(
      _orgId: string,
      fileId: string,
      chunks: LexicalChunk[]
    ): Promise<void> {
      // Replace, never accumulate: a re-indexed document may be shorter now.
      await db.delete(fileIndexChunk).where(eq(fileIndexChunk.fileId, fileId));
      for (let start = 0; start < chunks.length; start += INSERT_BATCH) {
        const rows = chunks.slice(start, start + INSERT_BATCH).map((chunk) => ({
          fileId,
          chunkIndex: chunk.index,
          text: chunk.text,
          indexedText: chunk.indexedText,
          heading: chunk.heading ?? null,
          page: chunk.page ?? null,
        }));
        if (rows.length > 0) {
          await db.insert(fileIndexChunk).values(rows);
        }
      }
    },

    async deleteDocument(_orgId: string, fileId: string): Promise<void> {
      await db.delete(fileIndexChunk).where(eq(fileIndexChunk.fileId, fileId));
    },

    async query(query: LexicalQuery): Promise<VectorHit[]> {
      // An empty readable set means the caller may read nothing here.
      if (query.groupIds.length === 0) {
        return [];
      }

      // `scopeWhereVisible` reads only the partition columns; the group is
      // carried by `groupWhereReadable` on the same row.
      const scope: ResolvedScope = {
        orgId: query.orgId,
        projectId: query.projectId,
        groupId: "",
      };
      const tsQuery = sql`websearch_to_tsquery(${DICTIONARY}, ${query.query})`;
      const rank = sql<number>`ts_rank(${fileIndexChunk.searchVector}, ${tsQuery})`;

      const conditions = [
        sql`${fileIndexChunk.searchVector} @@ ${tsQuery}`,
        scopeWhereVisible(file, scope, scopeFilterOf(query)),
        groupWhereReadable(file.groupId, query.groupIds),
        // Only a confirmed file is searchable, matching the dense side, which
        // only ever indexes a `ready` one.
        eq(file.status, "ready"),
      ];

      // Attribute filters live on `file_index.attributes`, which the dense side
      // stamps onto each vector. Applied here as a containment test on the
      // document's own row, so the two halves filter on the same values.
      const attributes = Object.entries(query.filter ?? {});
      if (attributes.length > 0) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM "file_index" fi
            WHERE fi."file_id" = ${fileIndexChunk.fileId}
              AND fi."attributes" @> ${JSON.stringify(
                Object.fromEntries(attributes)
              )}::jsonb
          )`
        );
      }

      const rows = (await db
        .select({
          fileId: fileIndexChunk.fileId,
          chunkIndex: fileIndexChunk.chunkIndex,
          text: fileIndexChunk.text,
          heading: fileIndexChunk.heading,
          page: fileIndexChunk.page,
          fileName: file.name,
          score: rank,
        })
        .from(fileIndexChunk)
        .innerJoin(file, eq(file.id, fileIndexChunk.fileId))
        .where(and(...conditions))
        .orderBy(sql`${rank} DESC`)
        .limit(query.topK)) as {
        fileId: string;
        chunkIndex: number;
        text: string;
        heading: string | null;
        page: number | null;
        fileName: string;
        score: number;
      }[];

      return rows.map((row) => ({
        fileId: row.fileId,
        fileName: row.fileName,
        chunkIndex: row.chunkIndex,
        text: row.text,
        heading: row.heading,
        page: row.page,
        score: Number(row.score),
      }));
    },
  };
}

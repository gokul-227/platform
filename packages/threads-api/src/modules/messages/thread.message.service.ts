import { randomUUID } from "node:crypto";
import {
  filterConditions,
  keysetOrder,
  keysetWhere,
  sortExpressions,
  totalOver,
} from "@aec-craft/platform-common/drizzle";
import type {
  CreateThreadMessageInput,
  ThreadMessageListInput,
  ThreadMessageListResponse,
  ThreadMessageResponse,
} from "@aec-craft/platform-contracts";
import {
  fetchCursorPage,
  fetchOffsetPage,
  resolvePageQuery,
  threadMessageFilters,
  threadMessageList,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { type Database, DatabaseToken } from "../../database/database.module";
import {
  type ThreadMessageRow,
  thread,
  threadMessage,
} from "../../database/schema";

/**
 * No update and no delete; the parent thread cascades. The controller has
 * authorized the thread, so these operate by `threadId`.
 */
@Injectable()
export class ThreadMessageService {
  constructor(@Inject(DatabaseToken) private readonly db: Database) {}

  async list(
    threadId: string,
    query: ThreadMessageListInput
  ): Promise<ThreadMessageListResponse> {
    const page = resolvePageQuery(threadMessageList.pagination, query);
    const conditions: SQL[] = [
      eq(threadMessage.threadId, threadId),
      ...filterConditions(
        threadMessageFilters,
        query as Record<string, unknown>
      ),
    ];
    if (page.mode === "offset") {
      const sort = sortExpressions(
        threadMessageFilters,
        query as Record<string, unknown>
      );
      const orderBy = sort.length > 0 ? sort : [asc(threadMessage.createdAt)];
      return await fetchOffsetPage(
        page,
        (limit, offset) =>
          this.db
            .select({ row: threadMessage, total: totalOver() })
            .from(threadMessage)
            .where(and(...conditions))
            .orderBy(...orderBy, asc(threadMessage.id))
            .limit(limit)
            .offset(offset),
        (r) => toThreadMessageResponse(r.row),
        (r) => r.total
      );
    }

    const keyset = {
      timestamp: threadMessage.createdAt,
      id: threadMessage.id,
      direction: "asc" as const,
    };
    return await fetchCursorPage(
      page,
      (limit) =>
        this.db
          .select()
          .from(threadMessage)
          .where(and(...conditions, keysetWhere(keyset, page.cursor)))
          .orderBy(...keysetOrder(keyset))
          .limit(limit),
      toThreadMessageResponse,
      (row) => [row.createdAt, row.id]
    );
  }

  async create(
    threadId: string,
    dto: CreateThreadMessageInput
  ): Promise<ThreadMessageResponse> {
    // One transaction: a crash between the two leaves the message stored and
    // the thread's `updatedAt` stale.
    const message = await this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(threadMessage)
        .values({
          id: randomUUID(),
          threadId,
          role: dto.role,
          content: dto.content,
          parts: dto.parts ?? null,
          references: dto.references ?? null,
          metadata: dto.metadata ?? {},
        })
        .returning();
      const row = rows[0];
      if (!row) {
        throw new Error("insert returned no row");
      }
      await tx
        .update(thread)
        .set({ updatedAt: new Date() })
        .where(eq(thread.id, threadId));
      return row;
    });
    return toThreadMessageResponse(message);
  }
}

export function toThreadMessageResponse(
  row: ThreadMessageRow
): ThreadMessageResponse {
  return {
    id: row.id,
    threadId: row.threadId,
    role: row.role as ThreadMessageResponse["role"],
    content: row.content,
    parts: row.parts ?? null,
    references: (row.references ?? null) as ThreadMessageResponse["references"],
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

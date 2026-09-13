import { randomUUID } from "node:crypto";
import {
  filterConditions,
  firstRowOrThrow,
  keysetOrder,
  keysetWhere,
  scopeWhereStrict,
  sortExpressions,
  totalOver,
} from "@aec-craft/platform-common/drizzle";
import type {
  CreateThreadInput,
  ResolvedScope,
  ThreadListInput,
  ThreadListResponse,
  ThreadResponse,
  UpdateThreadInput,
} from "@aec-craft/platform-contracts";
import {
  fetchCursorPage,
  fetchOffsetPage,
  PlatformError,
  resolvePageQuery,
  threadFilters,
  threadList,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { type Database, DatabaseToken } from "../database/database.module";
import { type ThreadRow, thread } from "../database/schema";
import { ThreadErrors } from "./thread.errors";

/**
 * Threads are not shared, so every read is owner-filtered on the subject the
 * token asserts. `@RequireRowPermit` has already enforced scope and
 * ownership; the service re-applies both as defence in depth.
 */
@Injectable()
export class ThreadService {
  constructor(@Inject(DatabaseToken) private readonly db: Database) {}

  async list(
    scope: ResolvedScope,
    ownerId: string,
    query: ThreadListInput
  ): Promise<ThreadListResponse> {
    const page = resolvePageQuery(threadList.pagination, query);
    const conditions: SQL[] = [
      scopeWhereStrict(thread, scope),
      eq(thread.subject, ownerId),
      ...filterConditions(threadFilters, query as Record<string, unknown>),
    ];
    if (page.mode === "offset") {
      const sort = sortExpressions(
        threadFilters,
        query as Record<string, unknown>
      );
      const orderBy = sort.length > 0 ? sort : [desc(thread.updatedAt)];
      return await fetchOffsetPage(
        page,
        (limit, offset) =>
          this.db
            .select({ row: thread, total: totalOver() })
            .from(thread)
            .where(and(...conditions))
            .orderBy(...orderBy, desc(thread.id))
            .limit(limit)
            .offset(offset),
        (r) => toThreadResponse(r.row),
        (r) => r.total
      );
    }

    const keyset = {
      timestamp: thread.updatedAt,
      id: thread.id,
      direction: "desc" as const,
      // Not the default `createdAt`: this keyset pages on `updatedAt`, and a
      // token naming the wrong column would decode to nothing and restart.
      field: "updatedAt",
    };
    return await fetchCursorPage(
      page,
      (limit) =>
        this.db
          .select()
          .from(thread)
          .where(and(...conditions, keysetWhere(keyset, page.cursor)))
          .orderBy(...keysetOrder(keyset))
          .limit(limit),
      toThreadResponse,
      (row) => [row.updatedAt, row.id],
      keyset.field
    );
  }

  async findById(
    scope: ResolvedScope,
    ownerId: string,
    threadId: string
  ): Promise<ThreadResponse> {
    const row = await this.loadOwned(scope, ownerId, threadId);
    return toThreadResponse(row);
  }

  async create(
    scope: ResolvedScope,
    dto: Omit<CreateThreadInput, "scope">,
    ownerId: string
  ): Promise<ThreadResponse> {
    const rows = await this.db
      .insert(thread)
      .values({
        id: randomUUID(),
        orgId: scope.orgId,
        projectId: scope.projectId,
        groupId: scope.groupId,
        // TODO: stamp client_id once the principal carries the OAuth azp claim.
        clientId: null,
        subject: ownerId,
        title: dto.title ?? null,
        metadata: dto.metadata ?? {},
      })
      .returning();
    return toThreadResponse(
      firstRowOrThrow(rows, () => new PlatformError(ThreadErrors.NOT_FOUND))
    );
  }

  async update(
    scope: ResolvedScope,
    ownerId: string,
    threadId: string,
    dto: UpdateThreadInput
  ): Promise<ThreadResponse> {
    await this.loadOwned(scope, ownerId, threadId);

    const patch: Partial<typeof thread.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.title !== undefined) {
      patch.title = dto.title;
    }

    const rows = await this.db
      .update(thread)
      .set(patch)
      .where(eq(thread.id, threadId))
      .returning();
    return toThreadResponse(
      firstRowOrThrow(rows, () => new PlatformError(ThreadErrors.NOT_FOUND))
    );
  }

  async delete(
    scope: ResolvedScope,
    ownerId: string,
    threadId: string
  ): Promise<void> {
    await this.loadOwned(scope, ownerId, threadId);
    await this.db.delete(thread).where(eq(thread.id, threadId));
  }

  private async loadOwned(
    scope: ResolvedScope,
    ownerId: string,
    threadId: string
  ): Promise<ThreadRow> {
    const rows = await this.db
      .select()
      .from(thread)
      .where(
        and(
          eq(thread.id, threadId),
          eq(thread.subject, ownerId),
          scopeWhereStrict(thread, scope)
        )
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(ThreadErrors.NOT_FOUND);
    }
    return row;
  }
}

export function toThreadResponse(row: ThreadRow): ThreadResponse {
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    clientId: row.clientId,
    subject: row.subject,
    title: row.title,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

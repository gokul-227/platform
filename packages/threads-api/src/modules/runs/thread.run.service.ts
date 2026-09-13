import { randomUUID } from "node:crypto";
import {
  filterConditions,
  firstRowOrThrow,
  keysetOrder,
  keysetWhere,
  sortExpressions,
  totalOver,
} from "@aec-craft/platform-common/drizzle";
import type {
  CompleteThreadRunInput,
  FailThreadRunInput,
  SubmitThreadRunInput,
  ThreadAgentConfig,
  ThreadModelTier,
  ThreadRunAction,
  ThreadRunListInput,
  ThreadRunListResponse,
  ThreadRunResponse,
} from "@aec-craft/platform-contracts";
import {
  fetchCursorPage,
  fetchOffsetPage,
  PlatformError,
  resolvePageQuery,
  threadRunFilters,
  threadRunList,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { type Database, DatabaseToken } from "../../database/database.module";
import {
  type ThreadRunRow,
  thread,
  threadMessage,
  threadRun,
} from "../../database/schema";
import { ThreadErrors } from "../thread.errors";

const ACTIVE_STATUSES = ["queued", "running", "streaming", "requires_action"];

/**
 * A run is created `queued` and finalized by its producer: `complete` inserts
 * the immutable assistant message and points the run at it, `fail` and `cancel`
 * are the other terminal transitions. Only a non-terminal run accepts one.
 */
@Injectable()
export class ThreadRunService {
  constructor(@Inject(DatabaseToken) private readonly db: Database) {}

  async list(
    threadId: string,
    query: ThreadRunListInput
  ): Promise<ThreadRunListResponse> {
    const page = resolvePageQuery(threadRunList.pagination, query);
    const conditions: SQL[] = [
      eq(threadRun.threadId, threadId),
      ...filterConditions(threadRunFilters, query as Record<string, unknown>),
    ];
    if (page.mode === "offset") {
      const sort = sortExpressions(
        threadRunFilters,
        query as Record<string, unknown>
      );
      const orderBy = sort.length > 0 ? sort : [desc(threadRun.createdAt)];
      return await fetchOffsetPage(
        page,
        (limit, offset) =>
          this.db
            .select({ row: threadRun, total: totalOver() })
            .from(threadRun)
            .where(and(...conditions))
            .orderBy(...orderBy, desc(threadRun.id))
            .limit(limit)
            .offset(offset),
        (r) => toThreadRunResponse(r.row),
        (r) => r.total
      );
    }

    const keyset = {
      timestamp: threadRun.createdAt,
      id: threadRun.id,
      direction: "desc" as const,
    };
    return await fetchCursorPage(
      page,
      (limit) =>
        this.db
          .select()
          .from(threadRun)
          .where(and(...conditions, keysetWhere(keyset, page.cursor)))
          .orderBy(...keysetOrder(keyset))
          .limit(limit),
      toThreadRunResponse,
      (row) => [row.createdAt, row.id]
    );
  }

  async findById(threadId: string, runId: string): Promise<ThreadRunResponse> {
    return toThreadRunResponse(await this.loadRun(threadId, runId));
  }

  async create(
    threadId: string,
    ownerId: string,
    tier: ThreadModelTier | null,
    agentConfig: ThreadAgentConfig | null,
    metadata: Record<string, unknown> | null = null
  ): Promise<ThreadRunResponse> {
    const rows = await this.db
      .insert(threadRun)
      .values({
        id: randomUUID(),
        threadId,
        status: "queued",
        tier,
        agentConfig,
        metadata: metadata ?? {},
        // TODO: stamp client_id once the principal carries the OAuth azp claim.
        clientId: null,
        subject: ownerId,
      })
      .returning();
    return toThreadRunResponse(
      firstRowOrThrow(rows, () => new PlatformError(ThreadErrors.RUN_NOT_FOUND))
    );
  }

  async complete(
    threadId: string,
    runId: string,
    dto: CompleteThreadRunInput
  ): Promise<ThreadRunResponse> {
    return await this.db.transaction(async (tx) => {
      const runs = await tx
        .select({ id: threadRun.id, status: threadRun.status })
        .from(threadRun)
        .where(and(eq(threadRun.id, runId), eq(threadRun.threadId, threadId)))
        .limit(1);
      const run = runs[0];
      if (!run) {
        throw new PlatformError(ThreadErrors.RUN_NOT_FOUND);
      }
      assertActive(run.status);

      const messages = await tx
        .insert(threadMessage)
        .values({
          id: randomUUID(),
          threadId,
          role: "assistant",
          content: dto.content,
          references: dto.references ?? null,
          metadata: dto.metadata ?? {},
        })
        .returning();
      const message = firstRowOrThrow(
        messages,
        () => new PlatformError(ThreadErrors.RUN_NOT_FOUND)
      );

      const now = new Date();
      const updatedRows = await tx
        .update(threadRun)
        .set({
          status: "complete",
          messageId: message.id,
          model: dto.usage?.model ?? null,
          inputTokens: dto.usage?.inputTokens ?? null,
          outputTokens: dto.usage?.outputTokens ?? null,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(threadRun.id, runId))
        .returning();

      await tx
        .update(thread)
        .set({ updatedAt: now })
        .where(eq(thread.id, threadId));
      return toThreadRunResponse(
        firstRowOrThrow(
          updatedRows,
          () => new PlatformError(ThreadErrors.RUN_NOT_FOUND)
        )
      );
    });
  }

  async fail(
    threadId: string,
    runId: string,
    dto: FailThreadRunInput
  ): Promise<ThreadRunResponse> {
    return this.terminate(threadId, runId, "failed", dto.error);
  }

  async cancel(threadId: string, runId: string): Promise<ThreadRunResponse> {
    return this.terminate(threadId, runId, "cancelled", null);
  }

  /**
   * Parks a generation that asked the user a question. Called by the executor,
   * never by a client, which answers through `submit`.
   */
  async requireAction(
    threadId: string,
    runId: string,
    action: ThreadRunAction
  ): Promise<ThreadRunResponse> {
    const rows = await this.db
      .update(threadRun)
      .set({ status: "requires_action", action, updatedAt: new Date() })
      .where(and(eq(threadRun.id, runId), eq(threadRun.threadId, threadId)))
      .returning();
    return toThreadRunResponse(
      firstRowOrThrow(rows, () => new PlatformError(ThreadErrors.RUN_NOT_FOUND))
    );
  }

  /**
   * Re-queues the run with the answer in `resume_input`, so the executor resumes
   * the parked agent from its checkpoint rather than starting over.
   */
  async submit(
    threadId: string,
    runId: string,
    dto: SubmitThreadRunInput
  ): Promise<ThreadRunResponse> {
    const run = await this.loadRun(threadId, runId);
    if (run.status !== "requires_action") {
      throw new PlatformError(ThreadErrors.RUN_NOT_AWAITING_INPUT);
    }
    const rows = await this.db
      .update(threadRun)
      .set({
        status: "queued",
        action: null,
        resumeInput: dto.answer,
        updatedAt: new Date(),
      })
      .where(eq(threadRun.id, runId))
      .returning();
    return toThreadRunResponse(
      firstRowOrThrow(rows, () => new PlatformError(ThreadErrors.RUN_NOT_FOUND))
    );
  }

  private async loadRun(
    threadId: string,
    runId: string
  ): Promise<ThreadRunRow> {
    const rows = await this.db
      .select()
      .from(threadRun)
      .where(and(eq(threadRun.id, runId), eq(threadRun.threadId, threadId)))
      .limit(1);
    const run = rows[0];
    if (!run) {
      throw new PlatformError(ThreadErrors.RUN_NOT_FOUND);
    }
    return run;
  }

  private async terminate(
    threadId: string,
    runId: string,
    status: "failed" | "cancelled",
    error: string | null
  ): Promise<ThreadRunResponse> {
    const run = await this.loadRun(threadId, runId);
    assertActive(run.status);
    const now = new Date();
    const rows = await this.db
      .update(threadRun)
      .set({ status, error, completedAt: now, updatedAt: now })
      .where(eq(threadRun.id, runId))
      .returning();
    return toThreadRunResponse(
      firstRowOrThrow(rows, () => new PlatformError(ThreadErrors.RUN_NOT_FOUND))
    );
  }
}

/** A run accepts a transition only while non-terminal. */
function assertActive(status: string): void {
  if (!ACTIVE_STATUSES.includes(status)) {
    throw new PlatformError(ThreadErrors.RUN_NOT_PENDING);
  }
}

export function toThreadRunResponse(row: ThreadRunRow): ThreadRunResponse {
  return {
    id: row.id,
    threadId: row.threadId,
    status: row.status as ThreadRunResponse["status"],
    tier: row.tier as ThreadRunResponse["tier"],
    action: row.action,
    messageId: row.messageId,
    usage:
      row.model == null
        ? null
        : {
            model: row.model,
            inputTokens: row.inputTokens ?? 0,
            outputTokens: row.outputTokens ?? 0,
          },
    debug: row.debug,
    error: row.error,
    clientId: row.clientId,
    subject: row.subject,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

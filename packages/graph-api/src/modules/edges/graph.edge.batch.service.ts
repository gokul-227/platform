import { rowInScope } from "@aec-craft/platform-common";
import {
  firstRowOrThrow,
  scopeWhereStrict,
} from "@aec-craft/platform-common/drizzle";
import type {
  GraphEdgeOp,
  GraphEdgeResponse,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { GraphTransaction } from "../../database/database.module";
import { graphEdge } from "../../database/schema";
import { GraphVocabularyService } from "../graph.vocabulary.service";
import { contentHash, digestsEqual } from "../versions/content-hash";
import { GraphVersionService } from "../versions/graph.version.service";
import { assertEndpointsVisible } from "./graph.edge.assertions";
import { GraphEdgeErrors } from "./graph.edge.errors";
import {
  edgeContent,
  type GraphEdgeRow,
  toGraphEdgeResponse,
} from "./graph.edge.mapper";

type WriteOp = Extract<GraphEdgeOp, { op: "create" | "upsert" | "update" }>;
type Outcome = "created" | "updated" | "skipped";

export interface GraphEdgeBatchResult {
  items: GraphEdgeResponse[];
  summary: {
    created: number;
    updated: number;
    deleted: number;
    skipped: number;
  };
}

/**
 * Edge ops inside a caller-owned transaction. Endpoints are immutable, so an
 * update touches only `type` and `properties`, and an upsert whose id exists
 * with different endpoints is a conflict.
 */
@Injectable()
export class GraphEdgeBatchService {
  constructor(
    @Inject(GraphVocabularyService)
    private readonly vocabulary: GraphVocabularyService,
    @Inject(GraphVersionService) private readonly versions: GraphVersionService
  ) {}

  async applyOpsInTrx(
    trx: GraphTransaction,
    scope: ResolvedScope,
    ops: GraphEdgeOp[],
    actorId: string | null
  ): Promise<GraphEdgeBatchResult> {
    const items: GraphEdgeResponse[] = [];
    const summary = { created: 0, updated: 0, deleted: 0, skipped: 0 };

    for (const op of ops) {
      if (op.op === "delete") {
        await this.deleteOp(trx, scope, op.id, actorId);
        summary.deleted += 1;
        continue;
      }
      const { row, outcome } = await this.writeOp(trx, scope, op, actorId);
      items.push(toGraphEdgeResponse(row));
      summary[outcome] += 1;
    }

    return { items, summary };
  }

  private writeOp(
    trx: GraphTransaction,
    scope: ResolvedScope,
    op: WriteOp,
    actorId: string | null
  ): Promise<{ row: GraphEdgeRow; outcome: Outcome }> {
    return op.op === "update"
      ? this.updateOp(trx, scope, op, actorId)
      : this.createOrUpsertOp(trx, scope, op, actorId);
  }

  private async createOrUpsertOp(
    trx: GraphTransaction,
    scope: ResolvedScope,
    op: Extract<GraphEdgeOp, { op: "create" | "upsert" }>,
    actorId: string | null
  ): Promise<{ row: GraphEdgeRow; outcome: Outcome }> {
    this.vocabulary.classify("edge_type", op.type, scope.orgId);
    await assertEndpointsVisible(trx, scope, op.sourceId, op.targetId);

    if (op.id !== undefined) {
      const existingRows = await trx
        .select()
        .from(graphEdge)
        .where(eq(graphEdge.id, op.id))
        .limit(1)
        .for("update");
      const existing = existingRows[0];
      if (existing) {
        const endpointsMatch =
          existing.sourceId === op.sourceId &&
          existing.targetId === op.targetId;
        if (
          op.op === "create" ||
          !rowInScope(existing, scope) ||
          !endpointsMatch
        ) {
          throw new PlatformError(GraphEdgeErrors.BATCH_ID_CONFLICT);
        }
        const hash = contentHash(edgeContent(op));
        if (digestsEqual(hash, existing.contentHash)) {
          return { row: existing, outcome: "skipped" };
        }

        const updatedRows = await trx
          .update(graphEdge)
          .set({
            type: op.type,
            properties: op.properties ?? {},
            contentHash: hash,
            version: sql`(${graphEdge.version}::int + 1)::text`,
            updatedAt: new Date(),
          })
          .where(eq(graphEdge.id, op.id))
          .returning();
        const updated = firstRowOrThrow(
          updatedRows,
          () => new PlatformError(GraphEdgeErrors.NOT_FOUND)
        );
        await this.recordWrite(trx, "updated", updated, hash, actorId);
        return { row: updated, outcome: "updated" };
      }
    }

    const hash = contentHash(edgeContent(op));
    const insertedRows = await trx
      .insert(graphEdge)
      .values({
        ...(op.id === undefined ? {} : { id: op.id }),
        orgId: scope.orgId,
        projectId: scope.projectId,
        groupId: scope.groupId,
        sourceId: op.sourceId,
        targetId: op.targetId,
        type: op.type,
        properties: op.properties ?? {},
        contentHash: hash,
      })
      .returning();
    const inserted = firstRowOrThrow(
      insertedRows,
      () => new PlatformError(GraphEdgeErrors.NOT_FOUND)
    );
    await this.recordWrite(trx, "created", inserted, hash, actorId);
    return { row: inserted, outcome: "created" };
  }

  private async updateOp(
    trx: GraphTransaction,
    scope: ResolvedScope,
    op: Extract<GraphEdgeOp, { op: "update" }>,
    actorId: string | null
  ): Promise<{ row: GraphEdgeRow; outcome: Outcome }> {
    const currentRows = await trx
      .select()
      .from(graphEdge)
      .where(and(eq(graphEdge.id, op.id), scopeWhereStrict(graphEdge, scope)))
      .limit(1)
      .for("update");
    const current = currentRows[0];
    if (!current) {
      throw new PlatformError(GraphEdgeErrors.NOT_FOUND);
    }

    if (op.type !== undefined) {
      this.vocabulary.classify("edge_type", op.type, scope.orgId);
    }

    const hash = contentHash(
      edgeContent({
        sourceId: current.sourceId,
        targetId: current.targetId,
        type: op.type ?? current.type,
        properties: op.properties ?? current.properties,
      })
    );
    if (digestsEqual(hash, current.contentHash)) {
      return { row: current, outcome: "skipped" };
    }

    const set: PgUpdateSetSource<typeof graphEdge> = {
      updatedAt: new Date(),
      version: sql`(${graphEdge.version}::int + 1)::text`,
      contentHash: hash,
    };
    if (op.type !== undefined) {
      set.type = op.type;
    }
    if (op.properties !== undefined) {
      set.properties = op.properties;
    }

    const updatedRows = await trx
      .update(graphEdge)
      .set(set)
      .where(eq(graphEdge.id, op.id))
      .returning();
    const updated = firstRowOrThrow(
      updatedRows,
      () => new PlatformError(GraphEdgeErrors.NOT_FOUND)
    );
    await this.recordWrite(trx, "updated", updated, hash, actorId);
    return { row: updated, outcome: "updated" };
  }

  private async deleteOp(
    trx: GraphTransaction,
    scope: ResolvedScope,
    edgeId: string,
    actorId: string | null
  ): Promise<void> {
    const rows = await trx
      .delete(graphEdge)
      .where(and(eq(graphEdge.id, edgeId), scopeWhereStrict(graphEdge, scope)))
      .returning({
        id: graphEdge.id,
        orgId: graphEdge.orgId,
        projectId: graphEdge.projectId,
        groupId: graphEdge.groupId,
        version: graphEdge.version,
      });
    const row = rows[0];
    if (!row) {
      throw new PlatformError(GraphEdgeErrors.NOT_FOUND);
    }
    await this.versions.record(trx, {
      entityType: "edge",
      entityId: row.id,
      op: "deleted",
      version: row.version,
      orgId: row.orgId,
      projectId: row.projectId,
      groupId: row.groupId,
      actorId,
      contentHash: null,
      snapshot: null,
    });
  }

  private async recordWrite(
    trx: GraphTransaction,
    op: "created" | "updated",
    row: GraphEdgeRow,
    hash: string,
    actorId: string | null
  ): Promise<void> {
    await this.versions.record(trx, {
      entityType: "edge",
      entityId: row.id,
      op,
      version: row.version,
      orgId: row.orgId,
      projectId: row.projectId,
      groupId: row.groupId,
      actorId,
      contentHash: hash,
      snapshot: { ...toGraphEdgeResponse(row) },
    });
  }
}

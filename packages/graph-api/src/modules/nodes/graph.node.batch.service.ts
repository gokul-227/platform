import { rowInScope } from "@aec-craft/platform-common";
import {
  firstRowOrThrow,
  scopeWhereStrict,
} from "@aec-craft/platform-common/drizzle";
import type {
  GraphNodeOp,
  GraphNodeResponse,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { GraphTransaction } from "../../database/database.module";
import { graphNode } from "../../database/schema";
import { GraphVocabularyService } from "../graph.vocabulary.service";
import { contentHash, digestsEqual } from "../versions/content-hash";
import { GraphVersionService } from "../versions/graph.version.service";
import {
  assertClassRootStable,
  assertNoCycle,
  assertParentVisible,
} from "./graph.node.assertions";
import { GraphNodeErrors } from "./graph.node.errors";
import {
  type GraphNodeRow,
  nodeContent,
  toGraphNodeResponse,
} from "./graph.node.mapper";

type WriteOp = Extract<GraphNodeOp, { op: "create" | "upsert" | "update" }>;
type Outcome = "created" | "updated" | "skipped";

export interface GraphNodeBatchResult {
  items: GraphNodeResponse[];
  summary: {
    created: number;
    updated: number;
    deleted: number;
    skipped: number;
  };
}

/**
 * Applies a list of node ops inside a caller-owned transaction. Writes
 * (create/upsert/update) return their resulting row as an item, in input
 * order; deletes contribute only to the summary. The combined
 * `GraphBatchService` feeds this write-only and delete-only subsets in the
 * right dependency order; passing a mixed list applies whatever it's given.
 *
 * Per-op semantics mirror the former single-entity service (content-hash
 * skip-if-unchanged, version bump, vocabulary classification, parent/cycle
 * checks, scope-strict by-id matching) plus `create`/`upsert` id-conflict
 * handling for client-supplied ids.
 */
@Injectable()
export class GraphNodeBatchService {
  constructor(
    @Inject(GraphVocabularyService)
    private readonly vocabulary: GraphVocabularyService,
    @Inject(GraphVersionService) private readonly versions: GraphVersionService
  ) {}

  async applyOpsInTrx(
    trx: GraphTransaction,
    scope: ResolvedScope,
    ops: GraphNodeOp[],
    actorId: string | null
  ): Promise<GraphNodeBatchResult> {
    const items: GraphNodeResponse[] = [];
    const summary = { created: 0, updated: 0, deleted: 0, skipped: 0 };

    for (const op of ops) {
      if (op.op === "delete") {
        await this.deleteOp(trx, scope, op.id, actorId);
        summary.deleted += 1;
        continue;
      }
      const { row, outcome } = await this.writeOp(trx, scope, op, actorId);
      items.push(toGraphNodeResponse(row));
      summary[outcome] += 1;
    }

    return { items, summary };
  }

  private writeOp(
    trx: GraphTransaction,
    scope: ResolvedScope,
    op: WriteOp,
    actorId: string | null
  ): Promise<{ row: GraphNodeRow; outcome: Outcome }> {
    return op.op === "update"
      ? this.updateOp(trx, scope, op, actorId)
      : this.createOrUpsertOp(trx, scope, op, actorId);
  }

  private async createOrUpsertOp(
    trx: GraphTransaction,
    scope: ResolvedScope,
    op: Extract<GraphNodeOp, { op: "create" | "upsert" }>,
    actorId: string | null
  ): Promise<{ row: GraphNodeRow; outcome: Outcome }> {
    this.classifyWrite(scope.orgId, op.type, op.class, op.properties);
    if (op.parentId != null) {
      await assertParentVisible(trx, scope, op.parentId);
    }

    if (op.id !== undefined) {
      const existingRows = await trx
        .select()
        .from(graphNode)
        .where(eq(graphNode.id, op.id))
        .limit(1)
        .for("update");
      const existing = existingRows[0];
      if (existing) {
        if (
          op.op === "create" ||
          !rowInScope(existing, scope) ||
          existing.type !== op.type
        ) {
          throw new PlatformError(GraphNodeErrors.BATCH_ID_CONFLICT);
        }
        assertClassRootStable(existing.class, op.class);
        if (op.parentId != null) {
          await assertNoCycle(trx, op.id, op.parentId);
        }
        const hash = contentHash(nodeContent(op));
        if (digestsEqual(hash, existing.contentHash)) {
          return { row: existing, outcome: "skipped" };
        }

        const updatedRows = await trx
          .update(graphNode)
          .set({
            class: op.class,
            name: op.name,
            parentId: op.parentId ?? null,
            phase: op.phase ?? null,
            properties: op.properties ?? {},
            contentHash: hash,
            version: sql`(${graphNode.version}::int + 1)::text`,
            updatedAt: new Date(),
          })
          .where(eq(graphNode.id, op.id))
          .returning();
        const updated = firstRowOrThrow(
          updatedRows,
          () => new PlatformError(GraphNodeErrors.NOT_FOUND)
        );
        await this.recordWrite(trx, "updated", updated, hash, actorId);
        return { row: updated, outcome: "updated" };
      }
    }

    const hash = contentHash(nodeContent(op));
    const insertedRows = await trx
      .insert(graphNode)
      .values({
        ...(op.id === undefined ? {} : { id: op.id }),
        orgId: scope.orgId,
        projectId: scope.projectId,
        groupId: scope.groupId,
        type: op.type,
        class: op.class,
        name: op.name,
        parentId: op.parentId ?? null,
        phase: op.phase ?? null,
        properties: op.properties ?? {},
        contentHash: hash,
      })
      .returning();
    const inserted = firstRowOrThrow(
      insertedRows,
      () => new PlatformError(GraphNodeErrors.NOT_FOUND)
    );
    await this.recordWrite(trx, "created", inserted, hash, actorId);
    return { row: inserted, outcome: "created" };
  }

  private async updateOp(
    trx: GraphTransaction,
    scope: ResolvedScope,
    op: Extract<GraphNodeOp, { op: "update" }>,
    actorId: string | null
  ): Promise<{ row: GraphNodeRow; outcome: Outcome }> {
    const currentRows = await trx
      .select()
      .from(graphNode)
      .where(and(eq(graphNode.id, op.id), scopeWhereStrict(graphNode, scope)))
      .limit(1)
      .for("update");
    const current = currentRows[0];
    if (!current) {
      throw new PlatformError(GraphNodeErrors.NOT_FOUND);
    }

    assertClassRootStable(current.class, op.class);
    if (op.class !== undefined) {
      const classRoot = op.class.split(".", 1)[0] ?? "";
      if (classRoot) {
        this.vocabulary.classify("class_root", classRoot, scope.orgId);
      }
    }
    if (op.properties !== undefined) {
      this.vocabulary.classifyBlockKeys(op.properties, scope.orgId);
    }
    if (op.parentId != null) {
      await assertParentVisible(trx, scope, op.parentId);
      await assertNoCycle(trx, op.id, op.parentId);
    }

    const hash = contentHash(
      nodeContent({
        type: current.type,
        class: op.class ?? current.class,
        name: op.name ?? current.name,
        parentId: op.parentId === undefined ? current.parentId : op.parentId,
        phase: op.phase === undefined ? current.phase : op.phase,
        properties: op.properties ?? current.properties,
      })
    );
    // Skip-if-unchanged: no version bump, no version row.
    if (digestsEqual(hash, current.contentHash)) {
      return { row: current, outcome: "skipped" };
    }

    const set: PgUpdateSetSource<typeof graphNode> = {
      updatedAt: new Date(),
      version: sql`(${graphNode.version}::int + 1)::text`,
      contentHash: hash,
    };
    if (op.name !== undefined) {
      set.name = op.name;
    }
    if (op.class !== undefined) {
      set.class = op.class;
    }
    if (op.parentId !== undefined) {
      set.parentId = op.parentId;
    }
    if (op.phase !== undefined) {
      set.phase = op.phase;
    }
    if (op.properties !== undefined) {
      set.properties = op.properties;
    }

    const updatedRows = await trx
      .update(graphNode)
      .set(set)
      .where(eq(graphNode.id, op.id))
      .returning();
    const updated = firstRowOrThrow(
      updatedRows,
      () => new PlatformError(GraphNodeErrors.NOT_FOUND)
    );
    await this.recordWrite(trx, "updated", updated, hash, actorId);
    return { row: updated, outcome: "updated" };
  }

  private async deleteOp(
    trx: GraphTransaction,
    scope: ResolvedScope,
    nodeId: string,
    actorId: string | null
  ): Promise<void> {
    // Cascade caveat: deleting a node cascades its edge rows in Postgres
    // WITHOUT edge tombstones in graph_version. The projection stays
    // consistent because the node tombstone maps to `DETACH DELETE`.
    const rows = await trx
      .delete(graphNode)
      .where(and(eq(graphNode.id, nodeId), scopeWhereStrict(graphNode, scope)))
      .returning({
        id: graphNode.id,
        orgId: graphNode.orgId,
        projectId: graphNode.projectId,
        groupId: graphNode.groupId,
        version: graphNode.version,
      });
    const row = rows[0];
    if (!row) {
      throw new PlatformError(GraphNodeErrors.NOT_FOUND);
    }
    await this.versions.record(trx, {
      entityType: "node",
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

  private classifyWrite(
    orgId: string,
    type: string,
    cls: string,
    properties: Record<string, unknown> | undefined
  ): void {
    this.vocabulary.classify("node_type", type, orgId);
    const classRoot = cls.split(".", 1)[0] ?? "";
    if (classRoot) {
      this.vocabulary.classify("class_root", classRoot, orgId);
    }
    this.vocabulary.classifyBlockKeys(properties, orgId);
  }

  private async recordWrite(
    trx: GraphTransaction,
    op: "created" | "updated",
    row: GraphNodeRow,
    hash: string,
    actorId: string | null
  ): Promise<void> {
    await this.versions.record(trx, {
      entityType: "node",
      entityId: row.id,
      op,
      version: row.version,
      orgId: row.orgId,
      projectId: row.projectId,
      groupId: row.groupId,
      actorId,
      contentHash: hash,
      snapshot: { ...toGraphNodeResponse(row) },
    });
  }
}

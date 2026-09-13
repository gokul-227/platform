import type {
  GraphBatchResponse,
  GraphEdgeOp,
  GraphNodeOp,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import {
  type ActorPrincipal,
  recordedActorId,
} from "@aec-craft/platform-users-api";
import { Inject, Injectable } from "@nestjs/common";
import { type Database, DatabaseToken } from "../../database/database.module";
import {
  type GraphEdgeBatchResult,
  GraphEdgeBatchService,
} from "../edges/graph.edge.batch.service";
import {
  type GraphNodeBatchResult,
  GraphNodeBatchService,
} from "../nodes/graph.node.batch.service";
import { GraphBatchErrors } from "./graph.batch.errors";

/**
 * One call, one transaction, both kinds. Ops run node writes, edge writes, edge
 * deletes, then node deletes, whatever their array position, so a node and the
 * edges touching it ride in the same call.
 *
 * The one combination that cannot be expressed is an edge write onto a node the
 * same changeset deletes, since the delete would cascade it away; that is
 * refused up front with `GRAPH_BATCH_EDGE_ENDPOINT_DELETED`.
 */
@Injectable()
export class GraphBatchService {
  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(GraphNodeBatchService)
    private readonly nodes: GraphNodeBatchService,
    @Inject(GraphEdgeBatchService) private readonly edges: GraphEdgeBatchService
  ) {}

  async applyChangeset(
    scope: ResolvedScope,
    input: { nodes?: GraphNodeOp[]; edges?: GraphEdgeOp[] },
    principal: ActorPrincipal | null = null
  ): Promise<GraphBatchResponse> {
    // Once per changeset: the version log records a line per entity, so
    // resolving there is a thousand lookups of one answer.
    const actorId = principal
      ? await recordedActorId(this.db, principal)
      : null;
    // The schema's `.default([])` only runs when a zod pipe parsed the body, so
    // an omitted list must still be safe here.
    const nodeOps = input.nodes ?? [];
    const edgeOps = input.edges ?? [];
    const nodeWrites = nodeOps.filter(isWrite);
    const nodeDeletes = nodeOps.filter(isDelete);
    const edgeWrites = edgeOps.filter(isWrite);
    const edgeDeletes = edgeOps.filter(isDelete);

    assertNoEdgeOntoDeletedNode(edgeWrites, nodeDeletes);

    return await this.db.transaction(async (trx) => {
      const nw = await this.nodes.applyOpsInTrx(
        trx,
        scope,
        nodeWrites,
        actorId
      );
      const ew = await this.edges.applyOpsInTrx(
        trx,
        scope,
        edgeWrites,
        actorId
      );
      const ed = await this.edges.applyOpsInTrx(
        trx,
        scope,
        edgeDeletes,
        actorId
      );
      const nd = await this.nodes.applyOpsInTrx(
        trx,
        scope,
        nodeDeletes,
        actorId
      );
      return {
        nodes: mergeNodeResults(nw, nd),
        edges: mergeEdgeResults(ew, ed),
      };
    });
  }
}

function isWrite<T extends { op: string }>(op: T): boolean {
  return op.op !== "delete";
}

function isDelete<T extends { op: string }>(op: T): boolean {
  return op.op === "delete";
}

function assertNoEdgeOntoDeletedNode(
  edgeWrites: GraphEdgeOp[],
  nodeDeletes: GraphNodeOp[]
): void {
  if (nodeDeletes.length === 0 || edgeWrites.length === 0) {
    return;
  }
  const deleted = new Set(nodeDeletes.map((op) => (op as { id: string }).id));
  for (const op of edgeWrites) {
    if (op.op !== "create" && op.op !== "upsert") {
      continue;
    }
    if (deleted.has(op.sourceId) || deleted.has(op.targetId)) {
      throw new PlatformError(GraphBatchErrors.EDGE_ENDPOINT_DELETED);
    }
  }
}

function mergeNodeResults(
  writes: GraphNodeBatchResult,
  deletes: GraphNodeBatchResult
): GraphNodeBatchResult {
  return {
    items: [...writes.items, ...deletes.items],
    summary: {
      created: writes.summary.created + deletes.summary.created,
      updated: writes.summary.updated + deletes.summary.updated,
      deleted: writes.summary.deleted + deletes.summary.deleted,
      skipped: writes.summary.skipped + deletes.summary.skipped,
    },
  };
}

function mergeEdgeResults(
  writes: GraphEdgeBatchResult,
  deletes: GraphEdgeBatchResult
): GraphEdgeBatchResult {
  return {
    items: [...writes.items, ...deletes.items],
    summary: {
      created: writes.summary.created + deletes.summary.created,
      updated: writes.summary.updated + deletes.summary.updated,
      deleted: writes.summary.deleted + deletes.summary.deleted,
      skipped: writes.summary.skipped + deletes.summary.skipped,
    },
  };
}

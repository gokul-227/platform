import {
  filterConditions,
  groupWhereReadable,
  keysetOrder,
  keysetWhere,
  scopeWhereVisible,
  sortExpressions,
  totalOver,
} from "@aec-craft/platform-common/drizzle";
import type {
  GraphEdgeListResponse,
  GraphEdgeResponse,
  ProjectGraphEdgeListInput,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import {
  fetchCursorPage,
  fetchOffsetPage,
  graphEdgeFilters,
  graphEdgeList,
  PlatformError,
  resolvePageQuery,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { type Database, DatabaseToken } from "../../database/database.module";
import { graphEdge } from "../../database/schema";
import { GraphEdgeErrors } from "./graph.edge.errors";
import { toGraphEdgeResponse } from "./graph.edge.mapper";

/**
 * Reads only; every write goes through the changeset. A project read hydrates
 * the org library above it, and `?scope=` narrows to one side or the other.
 */
@Injectable()
export class GraphEdgeService {
  constructor(@Inject(DatabaseToken) private readonly db: Database) {}

  async list(
    scope: ResolvedScope,
    query: ProjectGraphEdgeListInput,
    readable: readonly string[]
  ): Promise<GraphEdgeListResponse> {
    const page = resolvePageQuery(graphEdgeList.pagination, query);

    const conditions: SQL[] = [
      scopeWhereVisible(graphEdge, scope, query.scope),
      groupWhereReadable(graphEdge.groupId, readable),
      ...filterConditions(graphEdgeFilters, query as Record<string, unknown>),
    ];

    if (page.mode === "offset") {
      const sort = sortExpressions(
        graphEdgeFilters,
        query as Record<string, unknown>
      );
      const orderBy = sort.length > 0 ? sort : [desc(graphEdge.createdAt)];
      return await fetchOffsetPage(
        page,
        (limit, offset) =>
          this.db
            .select({ row: graphEdge, total: totalOver() })
            .from(graphEdge)
            .where(and(...conditions))
            .orderBy(...orderBy, desc(graphEdge.id))
            .limit(limit)
            .offset(offset),
        (r) => toGraphEdgeResponse(r.row, query.select),
        (r) => r.total
      );
    }

    const keyset = {
      timestamp: graphEdge.createdAt,
      id: graphEdge.id,
      direction: "desc" as const,
    };
    return await fetchCursorPage(
      page,
      (limit) =>
        this.db
          .select()
          .from(graphEdge)
          .where(and(...conditions, keysetWhere(keyset, page.cursor)))
          .orderBy(...keysetOrder(keyset))
          .limit(limit),
      (row) => toGraphEdgeResponse(row, query.select),
      (row) => [row.createdAt, row.id]
    );
  }

  async findById(
    scope: ResolvedScope,
    edgeId: string,
    projection?: string[]
  ): Promise<GraphEdgeResponse> {
    const rows = await this.db
      .select()
      .from(graphEdge)
      .where(and(eq(graphEdge.id, edgeId), scopeWhereVisible(graphEdge, scope)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(GraphEdgeErrors.NOT_FOUND);
    }
    return toGraphEdgeResponse(row, projection);
  }
}

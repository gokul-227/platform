import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
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
  GraphNodeListResponse,
  GraphNodeResponse,
  Permit,
  ProjectGraphNodeListInput,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import {
  fetchCursorPage,
  fetchOffsetPage,
  graphNodeFilters,
  graphNodeList,
  PlatformError,
  resolvePageQuery,
} from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { type Database, DatabaseToken } from "../../database/database.module";
import { graphNode } from "../../database/schema";
import { GraphNodeErrors } from "./graph.node.errors";
import { toGraphNodeResponse } from "./graph.node.mapper";

/**
 * Reads only; every write goes through the changeset. A project read hydrates
 * the org library above it, and `?scope=` narrows to one side or the other. An
 * org read never hydrates upward, because org is the top of the tree.
 *
 * The `properties` projection is applied in memory, on a page of at most 200.
 */
@Injectable()
export class GraphNodeService {
  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  /**
   * The by-id authorization a facade needs: the group is the row's own, and a
   * miss and a denial answer the same not-found. A route reaches this through
   * `@RequireRowPermit`; a facade calls it, because it translates the code on
   * the way out.
   */
  async authorizeById(
    principal: Principal,
    nodeId: string,
    permit: Permit
  ): Promise<ResolvedScope> {
    const rows = await this.db
      .select({
        groupId: graphNode.groupId,
        orgId: graphNode.orgId,
        projectId: graphNode.projectId,
      })
      .from(graphNode)
      .where(eq(graphNode.id, nodeId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(GraphNodeErrors.NOT_FOUND);
    }
    return await this.checks.assertCanRow(
      principal,
      permit,
      row,
      GraphNodeErrors.NOT_FOUND
    );
  }

  async list(
    scope: ResolvedScope,
    query: ProjectGraphNodeListInput,
    readable: readonly string[]
  ): Promise<GraphNodeListResponse> {
    const page = resolvePageQuery(graphNodeList.pagination, query);

    const conditions: SQL[] = [
      scopeWhereVisible(graphNode, scope, query.scope),
      groupWhereReadable(graphNode.groupId, readable),
      ...filterConditions(graphNodeFilters, query as Record<string, unknown>),
    ];

    if (page.mode === "offset") {
      const sort = sortExpressions(
        graphNodeFilters,
        query as Record<string, unknown>
      );
      const orderBy = sort.length > 0 ? sort : [desc(graphNode.createdAt)];
      return await fetchOffsetPage(
        page,
        (limit, offset) =>
          this.db
            .select({ row: graphNode, total: totalOver() })
            .from(graphNode)
            .where(and(...conditions))
            .orderBy(...orderBy, desc(graphNode.id))
            .limit(limit)
            .offset(offset),
        (r) => toGraphNodeResponse(r.row, query.select),
        (r) => r.total
      );
    }

    const keyset = {
      timestamp: graphNode.createdAt,
      id: graphNode.id,
      direction: "desc" as const,
    };
    return await fetchCursorPage(
      page,
      (limit) =>
        this.db
          .select()
          .from(graphNode)
          .where(and(...conditions, keysetWhere(keyset, page.cursor)))
          .orderBy(...keysetOrder(keyset))
          .limit(limit),
      (row) => toGraphNodeResponse(row, query.select),
      (row) => [row.createdAt, row.id]
    );
  }

  async findById(
    scope: ResolvedScope,
    nodeId: string,
    projection?: string[]
  ): Promise<GraphNodeResponse> {
    const rows = await this.db
      .select()
      .from(graphNode)
      .where(and(eq(graphNode.id, nodeId), scopeWhereVisible(graphNode, scope)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(GraphNodeErrors.NOT_FOUND);
    }
    return toGraphNodeResponse(row, projection);
  }
}

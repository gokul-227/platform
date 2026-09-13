import type {
  CypherQueryResponse,
  GraphNodeResponse,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import {
  GraphBatchService,
  GraphNodeService,
  GraphQueryService,
} from "@aec-craft/platform-graph-api/nest";
import type {
  RunGraphQueryInput,
  RunGraphSource,
} from "@aec-craft/platform-threads-api/nest";
import { RunGraphSourceToken } from "@aec-craft/platform-threads-api/nest";
import { Global, Injectable, Module } from "@nestjs/common";

/**
 * Host adapter: satisfies the threads run executor's graph capability with
 * graph-api's in-process services (query projection, source-of-truth
 * node reads, governed changeset writes). A detached threads deployment would
 * implement the same interface over HTTP instead.
 */
@Injectable()
export class PlatformRunGraphSource implements RunGraphSource {
  // TODO: no `analyses` yet; they return with the published cbm-analysis.
  constructor(
    private readonly graphQuery: GraphQueryService,
    private readonly graphNodes: GraphNodeService,
    private readonly graphBatch: GraphBatchService
  ) {}

  findNodeById(
    scope: ResolvedScope,
    nodeId: string
  ): Promise<GraphNodeResponse> {
    return this.graphNodes.findById(scope, nodeId);
  }

  runQuery(
    scope: ResolvedScope,
    input: RunGraphQueryInput
  ): Promise<CypherQueryResponse> {
    // The executor only builds the graph tool for project-scoped threads.
    const projectId = scope.projectId;
    if (projectId == null) {
      return Promise.reject(new Error("graph queries require a project scope"));
    }
    return this.graphQuery.cypher(input, { orgId: scope.orgId, projectId });
  }

  async updateNodeProperties(
    scope: ResolvedScope,
    nodeId: string,
    properties: Record<string, unknown>
  ): Promise<void> {
    await this.graphBatch.applyChangeset(
      scope,
      { nodes: [{ op: "update", id: nodeId, properties }] },
      null
    );
  }
}

@Global()
@Module({
  providers: [
    { provide: RunGraphSourceToken, useClass: PlatformRunGraphSource },
  ],
  exports: [RunGraphSourceToken],
})
export class RunGraphSourceModule {}

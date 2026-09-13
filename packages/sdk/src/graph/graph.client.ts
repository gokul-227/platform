import {
  GRAPH_VOCABULARY,
  type GraphBatchResponse,
  type GraphEdgeOp,
  type GraphNodeOp,
  type GraphScope,
} from "@aec-craft/platform-contracts";
import type { Http } from "../common/http";
import { qs } from "../common/qs";
import { scopeQuery } from "../common/scope";
import { GraphEdgeClient } from "./graph.edge.client";
import { GraphNodeClient } from "./graph.node.client";
import { GraphQueryClient } from "./graph.query.client";

/**
 * Graph namespace. `client.graph.nodes.*` / `client.graph.edges.*` cover reads
 * plus single-op write sugar; `client.graph.apply(scope, { nodes, edges })` is
 * the transactional changeset for multi-op / mixed-kind writes (the sugar
 * methods are thin wrappers over it). `client.graph.query.*` are analytical
 * queries (404 on deployments without a graph DB). `client.graph.vocabulary`
 * is a static manifest of the canonical vocabulary lists (no HTTP).
 */
export class GraphClient {
  readonly nodes: GraphNodeClient;
  readonly edges: GraphEdgeClient;
  readonly query: GraphQueryClient;
  readonly vocabulary = GRAPH_VOCABULARY;

  constructor(private readonly http: Http) {
    this.nodes = new GraphNodeClient(http);
    this.edges = new GraphEdgeClient(http);
    this.query = new GraphQueryClient(http);
  }

  /**
   * Apply a graph changeset: one transaction over both kinds. Ops are tagged
   * by `op` (`create | upsert | update | delete`); the server orders the
   * transaction node writes -> edge writes -> edge deletes -> node deletes, so
   * a node and the edges touching it (referencing it by a client-supplied id)
   * can ride in the same call. Either every op applies or none does.
   */
  apply = (
    scope: GraphScope,
    input: { nodes?: GraphNodeOp[]; edges?: GraphEdgeOp[]; groupId?: string }
  ): Promise<GraphBatchResponse> =>
    this.http.post<GraphBatchResponse>(`/graph${qs(scopeQuery(scope))}`, input);
}

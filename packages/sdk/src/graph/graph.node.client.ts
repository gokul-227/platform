import type {
  CreateGraphNodeInput,
  GetGraphNodeQuery,
  GraphBatchResponse,
  GraphNodeListResponse,
  GraphNodeResponse,
  GraphScope,
  ProjectGraphNodeListInput,
  UpdateGraphNodeInput,
} from "@aec-craft/platform-contracts";

import type { Http } from "../common/http";
import { qs } from "../common/qs";
import { scopeQuery } from "../common/scope";

type NodeWriteFields = CreateGraphNodeInput;

/**
 * Graph nodes. A list hangs off the org or project that owns the collection;
 * `get` stays flat, with the scope resolved from the row. Writes are sugar over
 * the changeset (`POST /orgs/:orgId/graph`, `POST /projects/:projectId/graph`):
 * each builds a one-op changeset and unwraps the single resulting node, so
 * callers keep clean per-entity CRUD while the wire has a single transactional
 * write surface. For multi-op or mixed node+edge writes, use
 * `client.graph.apply`.
 *
 *   client.graph.nodes.list({ type: "project", projectId }, { type: "object" })
 *   client.graph.nodes.create({ type: "org", orgId }, input)
 *   client.graph.nodes.update({ type: "org", orgId }, "node-id", patch)
 */
export class GraphNodeClient {
  constructor(private readonly http: Http) {}

  /** `query.scope` narrows a project list; naming an org read with it is refused. */
  list = (
    scope: GraphScope,
    query?: ProjectGraphNodeListInput
  ): Promise<GraphNodeListResponse> =>
    this.http.get<GraphNodeListResponse>(
      `/graph/nodes${qs({ ...scopeQuery(scope), ...query })}`
    );

  findById = (
    nodeId: string,
    query?: GetGraphNodeQuery
  ): Promise<GraphNodeResponse> =>
    this.http.get<GraphNodeResponse>(
      `/graph/nodes/${encodeURIComponent(nodeId)}${qs(query)}`
    );

  create = (
    scope: GraphScope,
    input: NodeWriteFields
  ): Promise<GraphNodeResponse> =>
    this.apply(scope, { op: "create", ...input });

  /** Create-or-replace by `id` (idempotent; unchanged content is skipped). */
  upsert = (
    scope: GraphScope,
    input: NodeWriteFields & { id?: string }
  ): Promise<GraphNodeResponse> =>
    this.apply(scope, { op: "upsert", ...input });

  update = (
    scope: GraphScope,
    nodeId: string,
    input: UpdateGraphNodeInput
  ): Promise<GraphNodeResponse> =>
    this.apply(scope, { op: "update", id: nodeId, ...input });

  delete = (scope: GraphScope, nodeId: string): Promise<void> =>
    this.http
      .post<GraphBatchResponse>(`/graph${qs(scopeQuery(scope))}`, {
        nodes: [{ op: "delete", id: nodeId }],
      })
      .then(() => undefined);

  private readonly apply = (
    scope: GraphScope,
    node: object
  ): Promise<GraphNodeResponse> =>
    this.http
      .post<GraphBatchResponse>(`/graph${qs(scopeQuery(scope))}`, {
        nodes: [node],
      })
      .then((res) => res.nodes.items[0]!);
}

import type {
  CreateGraphEdgeInput,
  GetGraphEdgeQuery,
  GraphBatchResponse,
  GraphEdgeListResponse,
  GraphEdgeResponse,
  GraphScope,
  ProjectGraphEdgeListInput,
  UpdateGraphEdgeInput,
} from "@aec-craft/platform-contracts";

import type { Http } from "../common/http";
import { qs } from "../common/qs";
import { scopeQuery } from "../common/scope";

type EdgeWriteFields = CreateGraphEdgeInput;

/**
 * Graph edges. Same shape as `GraphNodeClient`: a list hangs off its owning org
 * or project, `get` stays flat, and writes are one-op-changeset sugar over the
 * scoped `POST .../graph`. Endpoints (`sourceId`/`targetId`) are immutable, so
 * `update` carries only `type`/`properties`. For multi-op or mixed writes use
 * `client.graph.apply`.
 *
 *   client.graph.edges.list({ type: "project", projectId })
 *   client.graph.edges.create({ type: "project", projectId }, input)
 *   client.graph.edges.update({ type: "project", projectId }, "edge-id", { type: "bounds" })
 */
export class GraphEdgeClient {
  constructor(private readonly http: Http) {}

  /** `query.scope` narrows a project list; naming an org read with it is refused. */
  list = (
    scope: GraphScope,
    query?: ProjectGraphEdgeListInput
  ): Promise<GraphEdgeListResponse> =>
    this.http.get<GraphEdgeListResponse>(
      `/graph/edges${qs({ ...scopeQuery(scope), ...query })}`
    );

  findById = (
    edgeId: string,
    query?: GetGraphEdgeQuery
  ): Promise<GraphEdgeResponse> =>
    this.http.get<GraphEdgeResponse>(
      `/graph/edges/${encodeURIComponent(edgeId)}${qs(query)}`
    );

  create = (
    scope: GraphScope,
    input: EdgeWriteFields
  ): Promise<GraphEdgeResponse> =>
    this.apply(scope, { op: "create", ...input });

  /** Create-or-replace by `id` (idempotent; unchanged content is skipped). */
  upsert = (
    scope: GraphScope,
    input: EdgeWriteFields & { id?: string }
  ): Promise<GraphEdgeResponse> =>
    this.apply(scope, { op: "upsert", ...input });

  update = (
    scope: GraphScope,
    edgeId: string,
    input: UpdateGraphEdgeInput
  ): Promise<GraphEdgeResponse> =>
    this.apply(scope, { op: "update", id: edgeId, ...input });

  delete = (scope: GraphScope, edgeId: string): Promise<void> =>
    this.http
      .post<GraphBatchResponse>(`/graph${qs(scopeQuery(scope))}`, {
        edges: [{ op: "delete", id: edgeId }],
      })
      .then(() => undefined);

  private readonly apply = (
    scope: GraphScope,
    edge: object
  ): Promise<GraphEdgeResponse> =>
    this.http
      .post<GraphBatchResponse>(`/graph${qs(scopeQuery(scope))}`, {
        edges: [edge],
      })
      .then((res) => res.edges.items[0]!);
}

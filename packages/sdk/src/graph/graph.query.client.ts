import type {
  CypherQueryInput,
  CypherQueryResponse,
  GraphHealthResponse,
} from "@aec-craft/platform-contracts";

import type { Http } from "../common/http";

/**
 * Free-form read-only Cypher against the projected graph DB (EXPERIMENTAL).
 * Project-scoped: the projection is filtered through the injected `$orgId` /
 * `$projectId`, so there is no org-library equivalent. Deployments without a
 * graph database configured answer 503. Results can trail writes by the sync
 * lag (target p99 < 5s).
 *
 *   client.graph.query.run(projectId, {
 *     query: "MATCH (n:Node) WHERE n.projectId = $projectId RETURN n.name",
 *   })
 */
export class GraphQueryClient {
  constructor(private readonly http: Http) {}

  run = (
    projectId: string,
    input: CypherQueryInput
  ): Promise<CypherQueryResponse> =>
    this.http.post<CypherQueryResponse>(
      `/graph/query?projectId=${encodeURIComponent(projectId)}`,
      input
    );

  /**
   * Reachability probe over the projected graph DB: is it reachable? Always
   * resolves `{ reachable, engine, latencyMs }` (never errors) — `engine` is
   * the configured engine (null when no graph DB is configured) and
   * `latencyMs` is the measured connectivity round-trip (null when
   * unreachable). Does not lint the projection's structure.
   */
  health = (projectId: string): Promise<GraphHealthResponse> =>
    this.http.get<GraphHealthResponse>(
      `/graph/health?projectId=${encodeURIComponent(projectId)}`
    );
}

import type {
  CypherQueryInput,
  CypherQueryResponse,
  GraphHealthResponse,
} from "@aec-craft/platform-contracts";
import { ProjectionSessionService } from "@aec-craft/platform-graph-client";
import { Inject, Injectable } from "@nestjs/common";

import {
  assertEntitiesInScope,
  assertReadOnlyCypher,
  assertScopedCypher,
  type CypherScope,
  mapBoltValue,
  scopedCypher,
  toCypherResponse,
} from "./cypher.guard";

/** Hard cap on rows returned by the free-form endpoint. */
const CYPHER_MAX_RECORDS = 1000;
/** Shorter than an analysis gets: this statement was typed by a caller. */
const CYPHER_TIMEOUT_MS = 5000;

/**
 * Read-only access to the projection, so results trail writes by the sync lag.
 * One operation for now, free-form Cypher, with the guardrails in
 * `cypher.guard.ts`; typed traversal routes return as usage settles.
 */
@Injectable()
export class GraphQueryService {
  constructor(
    @Inject(ProjectionSessionService)
    private readonly projection: ProjectionSessionService
  ) {}

  async cypher(
    input: CypherQueryInput,
    scope: CypherScope
  ): Promise<CypherQueryResponse> {
    // The route exists on every deployment, so the session is what refuses
    // when no graph database is configured.
    assertReadOnlyCypher(input.query);
    // Refused before substitution, so a statement this cannot verify never
    // reaches the engine fenced on a guess.
    assertScopedCypher(input.query);

    const records = await this.projection.read(
      {
        params: {
          ...(input.params ?? {}),
          orgId: scope.orgId,
          projectId: scope.projectId,
        },
        text: scopedCypher(input.query, scope),
      },
      { timeoutMs: CYPHER_TIMEOUT_MS }
    );

    const truncated = records.length > CYPHER_MAX_RECORDS;
    const page = truncated ? records.slice(0, CYPHER_MAX_RECORDS) : records;

    const entities: { props: Record<string, unknown> }[] = [];
    const rows = page.map((record) => {
      const raw = record.toObject() as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(raw).map(([key, value]) => [
          key,
          mapBoltValue(value, entities),
        ])
      );
    });
    // Defence in depth rather than the fence itself: this sees the entities a
    // query returned, never the rows a scalar reduced them to. `:Scoped` is
    // what makes the scalar safe.
    assertEntitiesInScope(entities, scope);
    return toCypherResponse(rows, truncated);
  }

  /**
   * Reachability, nothing else, and it never throws: a health probe reports
   * status. With no graph database configured it answers `reachable: false`.
   */
  async health(): Promise<GraphHealthResponse> {
    const engine = this.projection.engine;
    const latencyMs = await this.projection.latency();
    return { engine, latencyMs, reachable: latencyMs !== null };
  }
}

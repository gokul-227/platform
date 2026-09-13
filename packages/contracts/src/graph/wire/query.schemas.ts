import { z } from "zod";

/**
 * Analytical graph queries served from the projected graph DB (not the
 * Postgres source of truth). Results reflect the projection and can trail
 * writes by the sync lag (target p99 < 5s).
 *
 * v1 deliberately ships ONE route: free-form read-only Cypher. Typed
 * traversal routes (egress, connectivity, ...) will return as the validator
 * work lands; the algorithm Cypher for them already exists engine-dialected
 * inside the API.
 */

/**
 * Free-form read-only Cypher against the projected graph (EXPERIMENTAL).
 *
 * Early-phase escape hatch so traversals don't each need a typed route
 * first. Guardrails (v1): write clauses rejected, the statement runs in a
 * read-only bolt transaction, `$orgId` / `$projectId` are injected as
 * parameters, and any returned node/relationship outside the authorized
 * scope fails the whole request. KNOWN LIMIT: scalar aggregates computed
 * over out-of-scope data are not detectable by post-filtering; hardening
 * (query analysis or per-tenant subgraphs) is a tracked follow-up. The
 * contract may change without notice; prefer the typed query routes where
 * one exists.
 */
export const cypherQueryInputSchema = z.object({
  /** openCypher statement. Use $orgId / $projectId for scope filters. */
  query: z.string().min(1).max(5000),
  /** Extra parameters, exposed verbatim (scalars and scalar arrays only). */
  params: z
    .record(
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.union([z.string(), z.number()])),
      ])
    )
    .optional(),
});
export type CypherQueryInput = z.infer<typeof cypherQueryInputSchema>;

/** Graph entities are mapped to tagged shapes; scalars pass through. */
export const cypherQueryResponseSchema = z.object({
  records: z.array(z.record(z.unknown())),
  /** Number of records returned (capped server-side; see route docs). */
  count: z.number().int(),
  truncated: z.boolean(),
});
export type CypherQueryResponse = z.infer<typeof cypherQueryResponseSchema>;

import { z } from "zod";

/**
 * Graph health is a reachability probe over a project's projected graph DB:
 * "is the graph database reachable?", nothing more. Structural-lint of the
 * projection is a separate concern, deferred.
 *
 * `reachable` is true iff the bolt driver answered a connectivity check.
 * `engine` is the configured engine (null when no graph DB is configured);
 * `latencyMs` is the measured probe round-trip (null when unreachable).
 */

export const graphHealthResponseSchema = z.object({
  reachable: z.boolean(),
  engine: z.enum(["memgraph", "neo4j"]).nullable(),
  latencyMs: z.number().nullable(),
});
export type GraphHealthResponse = z.infer<typeof graphHealthResponseSchema>;

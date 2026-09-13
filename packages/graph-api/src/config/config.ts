import { z } from "zod";

/**
 * Config for `GraphApiModule.forRoot()`, zod-validated at boot. The deployable
 * owns secret loading; this package never reads `process.env`.
 */
const ConfigSchema = z.object({
  databaseUrl: z.string().url(),
  /**
   * Unset: no bolt connection is opened, `/graph/query` answers 503, the sync
   * worker stays dormant, and the `graph_version` feed accumulates until an
   * environment gains one. Memgraph locally and deployed; Neo4j is the
   * documented swap target at scale.
   */
  graphDatabase: z
    .object({
      /** bolt:// (Memgraph) or neo4j+s:// (Neo4j, the swap target). */
      uri: z.string().min(1),
      username: z.string().min(1).optional(),
      password: z.string().min(1).optional(),
      /** Selects the algorithm dialect; plain Cypher is shared. */
      engine: z.enum(["memgraph", "neo4j"]).default("memgraph"),
      /** Gate for the in-process projection worker (reads stay available). */
      syncEnabled: z.boolean().default(true),
    })
    .optional(),
});

/** The parsed config, every default resolved. */
export type Config = z.infer<typeof ConfigSchema>;
/** What a host passes to `forRoot()`: defaults may be omitted. */
export type ConfigInput = z.input<typeof ConfigSchema>;

export function parseConfig(input: unknown): Config {
  return ConfigSchema.parse(input);
}

export const ConfigToken = Symbol.for("@aec-craft/platform-graph-api:config");

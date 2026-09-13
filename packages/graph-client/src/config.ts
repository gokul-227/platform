import { z } from "zod";

/**
 * What a connection needs, and nothing about what is projected into it. The
 * host reads these from the environment; whether the projection worker runs is
 * graph-api's question, not this one.
 */
export const graphClientConfigSchema = z.object({
  /** bolt:// (Memgraph) or neo4j+s:// (Neo4j, the swap target). */
  uri: z.string().min(1),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  /** Selects the DDL dialect; plain Cypher is shared. */
  engine: z.enum(["memgraph", "neo4j"]).default("memgraph"),
});

export type GraphClientConfig = z.infer<typeof graphClientConfigSchema>;
export type GraphClientConfigInput = z.input<typeof graphClientConfigSchema>;

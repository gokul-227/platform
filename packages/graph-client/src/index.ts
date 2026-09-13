// `@aec-craft/platform-graph-client` — the read side of the graph projection.
//
// The projection is a derived copy of `graph_node` / `graph_edge` in a graph
// engine, and two packages read it: graph-api serves `POST /graph/query`, and
// analysis-api walks it. Neither needs the other, and both need this.
//
// Nothing here names a node type, a class, an edge type or a table. What is
// projected, and by what, is graph-api's; this is the connection, the engine's
// dialect, and one read.

export {
  type GraphClientConfig,
  type GraphClientConfigInput,
  graphClientConfigSchema,
} from "./config";
export {
  type CypherStatement,
  type GraphDialect,
  MemgraphDialect,
  Neo4jDialect,
} from "./dialect";
export { GraphClientErrors } from "./errors";
export { GraphClientModule } from "./graph.client.module";
export { ProjectionSessionService } from "./session";
export { GraphDialectToken, GraphDriverToken } from "./tokens";

/**
 * Their own file, not the module that provides them: a service injecting one
 * imports it, the module imports the service, and the cycle leaves `@Inject`
 * reading `undefined`. It surfaces as "can't resolve dependencies ... argument
 * Function at index [0]", a long way from the cause.
 */

/**
 * The bolt driver; neo4j-driver speaks to both engines. Null when no graph
 * database is configured, which every consumer has to handle.
 */
export const GraphDriverToken = Symbol.for(
  "@aec-craft/platform-graph-client:driver"
);

/** The engine dialect: the DDL divergence between Memgraph and Neo4j. */
export const GraphDialectToken = Symbol.for(
  "@aec-craft/platform-graph-client:dialect"
);

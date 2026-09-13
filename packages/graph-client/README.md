# @aec-craft/platform-graph-client

The read side of the graph projection, embedded in the `apps/api` host: the bolt
driver, the engine dialect, and one read-only session with a timeout.

The projection is a derived copy of `graph_node` and `graph_edge` in a graph
engine. Two packages read it — `graph-api` serves `POST /graph/query`, and
`analysis-api` walks it for routes, components and reachability — and neither
needs the other. Writing it is `graph-api`'s sync worker, which stays there
with the tables it projects.

No routes, no OpenAPI document, and no domain vocabulary: nothing here names a
node type, a class, an edge type or a table.

## Layout

| Path                      | What lives there                                     |
| ------------------------- | ---------------------------------------------------- |
| `src/config.ts`           | the connection, zod-validated                        |
| `src/dialect.ts`          | the DDL divergence between Memgraph and Neo4j        |
| `src/session.ts`          | `ProjectionSessionService`: read-only, timed, raw records |
| `src/errors.ts`           | `GRAPH_UNAVAILABLE`, the one refusal this package owns |
| `src/tokens.ts`           | the driver and dialect tokens                        |
| `src/graph.client.module.ts` | `GraphClientModule.forRoot()`                     |

## Consuming

```ts
@Module({ imports: [GraphClientModule.forRoot(config.graphDatabase)] })
```

Global, so a service injects `ProjectionSessionService` without importing a
module. Called with nothing — no graph database configured — the driver is null,
`isAvailable` is false and every read answers `GRAPH_UNAVAILABLE`. Postgres is
the source of truth, so that is a degraded read surface rather than an outage.

```ts
const records = await this.session.read({
  text: "MATCH (n:Node {projectId: $projectId}) RETURN n LIMIT 10",
  params: { projectId },
});
```

Records come back raw: a wire response and an analysis want different shapes out
of the same rows. Statements are the caller's, and so is proving they are safe —
a statement a client typed must be proven read-only and its results
scope-checked, one the repo wrote must be proven to name the scope parameters,
and folding both in here would make that a flag.

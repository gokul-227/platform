# @aec-craft/platform-analysis-api

Named computations over a project's building model. Owns no tables: every answer
is derived from the graph and rebuildable, so there is no migration chain.

One directory per analysis, flat, and the routes are flat with them. Retiring
one is deleting its folder and the line that imports it, with nothing of it left
anywhere else. A group is a classification and a path is an identifier, so
grouping lives in the OpenAPI tags, where being wrong costs one line.

One route per analysis, each with its own body and its own response, because a
connectivity answer and a travel distance have nothing in common except the
overlay the viewer draws. There is no catalogue and no registry: the portal
describes the routes, and the agent's tools are built in `platform-mcp-tools`.

## Routes

| Method | Path                                         | Notes                                            |
| ------ | -------------------------------------------- | ------------------------------------------------ |
| POST   | `/projects/:projectId/analysis/quantity`     | count or total any field over a class, optionally grouped; one number, or `{group, value}` rows |
| POST   | `/projects/:projectId/analysis/ratio`        | one quantity over another, both operands returned, because a null ratio has three different causes |
| POST   | `/projects/:projectId/analysis/adjacency`    | pairs of spaces sharing a boundary through `adjacentTo`, a wall rather than a way through; `differingUseOnly` keeps unlike neighbours |
| POST   | `/projects/:projectId/analysis/containment`  | spatial-tree defects: nodes with no container, and nodes contained by more than one |
| POST   | `/projects/:projectId/analysis/connectivity` | whether every space reaches every other through modelled passages; islands largest first when they do not |
| POST   | `/projects/:projectId/analysis/chokepoints`  | passages and spaces that cannot be routed around, worst first, each with how many spaces it strands |
| POST   | `/projects/:projectId/analysis/routing`      | the shortest way between two spaces, walked in the direction of travel, in metres where passages carry a `length` |
| POST   | `/projects/:projectId/analysis/egress`       | travel distance from each space to its nearest exit, with spaces that have no way out listed separately |

POST only because the parameters are structured, and every route declares
`read`.

## Authorization

Every route declares `@RequirePermit("read")` and the host's guard pipeline
asserts it. An analysis computes and returns without writing, so `read` is the
right permit.

The project alone would not be enough: an aggregate over its nodes would include
rows in groups the caller cannot read, which turns a count into a map of what
exists. So a route also lists the readable groups and passes them with the
scope, and the compiled query carries both predicates. A wrong count still looks
like a count, so this cannot be a filter applied to a result.

## Two ways to ask

**If the question is select, filter, aggregate or group, it goes to Postgres;
only traversal and components go to the projection.**

The two obvious arguments for putting everything on the projection are both
false. Expressiveness is a wash: blocks project as real maps, so Cypher dots
into `n.envelope.areaNet` and aggregates it. Speed favours Postgres, 1.5x to
4.4x across counts, groupings, a nested filter and a one-hop join, though
everything is under 6ms at this size and so decides nothing today.

What decides it is that the projection is derived: it trails writes by the sync
lag by construction, and it is optional infrastructure, so everything reading it
answers 503 on a deployment without a graph database. An aggregate is evidence a
verdict cites, so it answers from the row that was committed.

`SqlQueryService` holds the pool and `CypherQueryService` the projection
session, both from the graph slice, which is global and already configured by
the host. Both take the scope as an argument rather than holding one.

## Graph algorithms

Every MAGE procedure takes a `project()` subgraph as its first argument, which
is the only thing that makes one scopeable: `bridges.get()` and the rest take no
arguments otherwise and would run over the whole database. `PASSABLE_GRAPH` is
that projection, and swapping the procedure after it is the whole difference
between connectivity, chokepoints and the circulation spine.

The `*0..1` in it is load-bearing and silent when wrong: a projection built from
`(a)-[:CONNECTS_TO]-(b)` drops every isolated space, which is exactly what a
connectivity check looks for. Measured on a real export, that reads 6 components
where the truth is 185.

## Layout

| Path                                | What lives there                            |
| ----------------------------------- | ------------------------------------------- |
| `src/config/`                       | `AnalysisApiModule`; nothing to configure   |
| `src/modules/analysis.scope.ts` | the project and readable groups a query is confined to |
| `src/modules/query/`       | the two ways to ask, and the shared projection |
| `src/modules/<name>/`      | one analysis: controller, service, module, DTOs |
| `src/nest/`                         | NestJS bindings + the OpenAPI document spec |

## Consuming

```ts
@Module({
  imports: [
    AuthorizationModule.forRoot({ databaseUrl, ketoReadUrl, ketoWriteUrl }),
    GraphApiModule.forRoot({ databaseUrl: DATABASE_URL, graphDatabase }),
    AnalysisApiModule,
  ],
})
```

No `forRoot`: this package owns no tables and no pool. It reads the graph
slice's, so `GraphApiModule` must be registered. Circulation analyses need
`graphDatabase` configured and answer 503 without it.

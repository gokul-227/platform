# @aec-craft/platform-graph-api

The LOCUS-aligned property graph, embedded in the `apps/api` host: nodes and
edges with capability-block property bags, one transactional changeset write
surface, versioning, the projection sync worker, and read-only openCypher over
the projection.

Operates on its slice of the **platform database** and owns that slice's
migrations. Writes are relational and authoritative; the graph database is a
projection the sync worker feeds from the `graph_version` log.

## Routes

| Method | Path                  | Notes                                            |
| ------ | --------------------- | ------------------------------------------------ |
| POST   | `/orgs/:orgId/graph`               | the changeset: nodes + edges in one transaction, landing in the org library |
| POST   | `/projects/:projectId/graph`       | the same changeset, landing in the project       |
| GET    | `/orgs/:orgId/graph/nodes`         | the org's shared library                         |
| GET    | `/projects/:projectId/graph/nodes` | the project, hydrated with the library; `?scope=` narrows |
| GET    | `/graph/nodes/:nodeId`             | flat; scope resolved from the row                |
| GET    | `/orgs/:orgId/graph/edges`         | same shape as nodes                              |
| GET    | `/projects/:projectId/graph/edges` | same shape as nodes                              |
| GET    | `/graph/edges/:edgeId`             | flat; scope resolved from the row                |
| POST   | `/projects/:projectId/graph/query` | read-only openCypher (EXPERIMENTAL)              |
| GET    | `/projects/:projectId/graph/health`| projection lag + connectivity                    |

All writes go through the changeset; a single mutation is an array of one. The
server orders the transaction node writes -> edge writes -> edge deletes ->
node deletes, so a node and the edges touching it ride in one call.

## Layout

| Path                            | What lives there                             |
| ------------------------------- | -------------------------------------------- |
| `src/config/`                   | `GraphApiModule.forRoot()` + `Config`        |
| `src/database/`                 | drizzle schema (`graph_node` / `graph_edge` / `graph_version`) |
| `src/modules/batch/`      | the changeset controller + transaction owner |
| `src/modules/nodes/`      | node read surface, mapper, batch service     |
| `src/modules/edges/`      | edge read surface, mapper, batch service     |
| `src/modules/query/`      | openCypher endpoint + the write-clause guard |
| `src/modules/sync/`       | the in-process projection worker; the connection it writes through is `@aec-craft/platform-graph-client` |
| `src/modules/versions/`   | the version log + content hashing            |
| `src/nest/`                     | NestJS bindings + the OpenAPI document spec  |
| `drizzle/`                      | migrations, journaled in `__drizzle_migrations_graph` |
| `bin/graph-api-migrate`         | the migrate CLI                              |
| `compose.graph.yaml`            | local Memgraph + Lab                         |

## Consuming

```ts
@Module({
  imports: [
    AuthorizationModule.forRoot({ databaseUrl, ketoReadUrl, ketoWriteUrl }),
    GraphApiModule.forRoot({
      databaseUrl: DATABASE_URL,
      graphDatabase: {
        uri: GRAPH_DB_URI,           // bolt:// (Memgraph) or neo4j+s://
        username: GRAPH_DB_USERNAME, // optional
        password: GRAPH_DB_PASSWORD, // optional
        engine: "memgraph",          // or "neo4j"
        syncEnabled: true,
      },
    }),
  ],
})
```

`graphDatabase` is optional. Unset, the routes still exist and degrade:
the query route answers 503, the sync worker stays dormant, and the
`graph_version` feed accumulates unsynced rows that the worker replays once an
environment gains a graph database.

Local graph database: `pnpm --filter @aec-craft/platform-graph-api db:graph:up`.

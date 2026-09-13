# @aec-craft/platform-objects-api

The building: sites, storeys, spaces and the elements that enclose and divide
them. Presents the object half of the graph as its own resource.

**Owns no tables.** Every read is a read of `graph_node` narrowed to
`type: object` before the query runs, through the graph slice's own service, so
no rule or source can appear here whatever a caller passes. The filter, sort,
cursor and `?select=` grammar is the graph node list's own.

What it does own is the code it refuses with: `OBJECT_NOT_FOUND`, translated
from the store's `GRAPH_NODE_NOT_FOUND` on the way out, because a caller who
asked about an object should not be told about `graph_node`.

## Routes

| Method | Path                            | Notes                                  |
| ------ | ------------------------------- | -------------------------------------- |
| GET    | `/objects?orgId=` \| `?projectId=` | `read` on the scope named; a project read hydrates the org library |
| GET    | `/objects/:objectId`            | flat; the permit runs against the row's group |

Read-only. A building arrives from an importer as a changeset, so a lone create
would leave an element with no place in the spatial tree and a lone delete would
orphan the edges and verdicts citing it.

## Layout

| Path                     | What lives there                                |
| ------------------------ | ----------------------------------------------- |
| `src/config/`            | `ObjectsApiModule`; nothing to configure        |
| `src/modules/`   | controller, the type-narrowing service, DTOs, errors |
| `src/nest/`              | NestJS bindings + the OpenAPI document spec     |

## Consuming

```ts
@Module({
  imports: [
    AuthorizationModule.forRoot({ databaseUrl, ketoReadUrl, ketoWriteUrl }),
    GraphApiModule.forRoot({ databaseUrl: DATABASE_URL }),
    ObjectsApiModule,
  ],
})
```

No `forRoot`: this package owns no tables. `ObjectService` extends the graph
slice's `GraphNodeTypeService`, so `GraphApiModule` must be registered.

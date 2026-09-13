# @aec-craft/platform-rules-api

The corpus: what a project must satisfy, and where each requirement came from.
Presents the rule half of the graph as its own resource.

**Owns no tables.** Every read is a read of `graph_node` narrowed to
`type: rule` before the query runs, through the graph slice's own service. The
filter, sort, cursor and `?select=` grammar is the graph node list's own.

A rule carries a selector saying what it applies to and a criterion saying what
it demands, and reaches its subjects by matching class and property path rather
than by an edge, which is why nothing here joins the building. Org-scoped rules
hydrate into a project read the way an org file library does.

What it does own is the code it refuses with: `RULE_NOT_FOUND`, translated from
the store's `GRAPH_NODE_NOT_FOUND` on the way out.

## Routes

| Method | Path                                       | Notes                        |
| ------ | ------------------------------------------ | ---------------------------- |
| GET    | `/rules?orgId=` \| `?projectId=`           | `read` on the scope named; a project read hydrates the org's rules |
| GET    | `/rules/:ruleId`                           | flat; the permit runs against the row's group |
| POST   | `/rules/extractions?projectId=`            | `write`; 501 until the pipeline lands |
| GET    | `/rules/extractions?projectId=`            | runs, newest first           |
| GET    | `/rules/extractions/:runId`                | one run, flat                |
| GET    | `/rules/extractions/coverage?projectId=`   | one row per unit of source text |
| GET    | `/rules/extractions/vocabulary?projectId=` | the grounding call for an extractor |

Extraction is the route surface only; every handler answers 501 while the
pipeline is designed (TODO(#232)). Writes to a rule itself are TODO(#231), over
the changeset. Delete stays absent even then: disabling a rule keeps its
verdicts, its provenance and its place in the coverage denominator.

## Layout

| Path                              | What lives there                          |
| --------------------------------- | ----------------------------------------- |
| `src/config/`                     | `RulesApiModule`; nothing to configure    |
| `src/modules/`              | controller, the type-narrowing service, DTOs, errors |
| `src/modules/extractions/`  | the extraction submodule                  |
| `src/nest/`                       | NestJS bindings + the OpenAPI document spec |

## Consuming

```ts
@Module({
  imports: [
    AuthorizationModule.forRoot({ databaseUrl, ketoReadUrl, ketoWriteUrl }),
    GraphApiModule.forRoot({ databaseUrl: DATABASE_URL }),
    RulesApiModule,
  ],
})
```

No `forRoot`: this package owns no tables. `RuleService` extends the graph
slice's `GraphNodeTypeService`, so `GraphApiModule` must be registered.

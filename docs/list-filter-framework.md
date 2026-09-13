# List, filter, and pagination framework

The cross-cutting convention behind every list endpoint. One spec per resource
declares the filters, the sortable fields, and the pagination modes; that spec
then drives the wire schema, the OpenAPI parameters, and the server-side query
builder, so the three cannot drift apart.

- Specs and schema generators: `packages/contracts/src/common/filters/`
- OpenAPI decorators: `packages/common/src/nest/`
- Query appliers and the pagination runtime: `packages/common/src/drizzle/`,
  `packages/common/src/pagination.ts`, `packages/common/src/cursor.ts`

## Wire syntax

Each filter value is `op.value`. The operator catalog and per-field type
coercion live in `operators.ts`.

```
?role=eq.owner
?role=in.(owner,manager,editor)
?email=startsWith.marius
?createdAt=gte.2026-01-01
?joinedAt=gte.2026-01-01&joinedAt=lte.2026-06-01     (AND-ed across repeats)
```

- **Bare-value shorthand**: `?role=owner` means `?role=eq.owner`.
- **Case-insensitive by default** for `startsWith` / `endsWith` / `contains`
  (compiled to `ILIKE`).
- **`in.(a,b,c)` requires parens**, so values containing commas stay
  unambiguous.
- **JSONB path filters** use Postgres arrow syntax in the query key:
  `?properties=hasKey.envelope`, `?properties->envelope->netArea=gte.5`.
- **Sort**: `?sort=field:asc|desc`, repeatable, evaluated in input order.
  Offset pages only — cursor pages are pinned to the keyset order and a
  `?sort` on one is rejected.

## Pagination

Two modes, declared per endpoint:

| Mode     | Params                | Response adds                            | Fits             |
| -------- | --------------------- | ---------------------------------------- | ---------------- |
| `cursor` | `limit`, `cursor`     | `nextCursor`                             | feeds, infinite scroll |
| `offset` | `page`, `pageSize`    | `page`, `pageSize`, `total`, `totalPages` | tables with page numbers |

Every list response is an envelope: `{ items, ...pageMeta }`. An endpoint
allowing both modes picks per request from the params present; mixing the two
families is a 400, and a request with neither gets the spec's default mode. On
a dual-mode endpoint the meta of the serving mode is present and the other's is
absent, so both are typed optional.

Cursors are opaque base64url `(timestamp, id)` keysets. A tampered cursor
decodes to a sentinel and yields an empty page rather than a 500.

## Declaring a spec

One file per resource, next to the schemas, e.g.
`packages/contracts/src/tenancy/projects/project.filters.ts`:

```ts
import { column, defineFilters, defineListSpec } from "../../common/filters";

export const projectFilters = defineFilters({
  name: column.string({
    ops: ["eq", "startsWith", "contains"],
    description: "Filter by display name.",
    sortable: true,
  }),
  // Joined-relation column: the service must put the `p` alias in scope.
  orgId: column.uuid({
    ops: ["eq"],
    column: "p.orgId",
    description: "Filter by owning organization.",
  }),
  createdAt: column.date({
    ops: ["gte", "lte"],
    column: "p.createdAt",
    description: "Filter by creation date (ISO 8601).",
    sortable: true,
  }),
});

export const projectList = defineListSpec({
  filters: projectFilters,
  pagination: { modes: ["cursor", "offset"], default: "offset" },
  defaultSort: "name:asc",
});
```

Builders: `column.string`, `column.number`, `column.uuid`, `column.date`,
`column.boolean`, `jsonbPath`. Each takes `{ ops, column?, description?,
sortable? }`; `column` defaults to the wire field name, override it for a joined
alias (`p.orgId`) or a wire-vs-column rename. `jsonbPath` is what backs
`?context->requestId=eq.<id>` on the audit feed, which correlates every row from
one HTTP call.

## Schemas

```ts
export const projectListInputSchema = listInputSchema(projectList);
export const projectListResponseSchema = listResponseSchema(
  projectList,
  projectResponseSchema
);
```

`listInputSchema` emits the pagination params of every allowed mode, `?sort`
when offset is allowed and the spec has sortable fields, and one
`z.string().optional()` per filter field. The `op.value` prefix is validated and
type-coerced in the applier, not at the zod boundary, which keeps one named
OpenAPI parameter per field instead of the cartesian product of (field, op).

An endpoint with query fields of its own extends the result. `fileListInputSchema`
adds the scope pair and `parentId`.

## Service

```ts
async list(orgId: string, input: ProjectListInput): Promise<ProjectListResponse> {
  const page = resolvePageQuery(projectList.pagination, input);
  const conditions: SQL[] = [
    eq(p.orgId, orgId),
    ...filterConditions(projectList.filters, input as Record<string, unknown>),
  ];

  if (page.mode === "offset") {
    const sort = sortExpressions(projectList.filters, input as Record<string, unknown>);
    const orderBy = sort.length > 0 ? sort : [asc(p.name)];
    return await fetchOffsetPage(
      page,
      (limit, offset) => this.db
        .select({ ...projectSelection, total: totalOver() })
        .from(p)
        .where(and(...conditions))
        .orderBy(...orderBy, desc(p.id))
        .limit(limit).offset(offset),
      toProjectResponse,
      (row) => row.total
    );
  }

  if (page.cursor !== null) {
    const cursor = decodeCursor(page.cursor, "desc");
    conditions.push(sql`(${p.createdAt}, ${p.id}) < (${cursor.createdAt}, ${cursor.id})`);
  }
  const rows = await this.db
    .select(projectSelection).from(p)
    .where(and(...conditions))
    .orderBy(desc(p.createdAt), desc(p.id))
    .limit(page.limit + 1);
  return paginateKeyset(rows, page.limit, toProjectResponse, (row) => [row.createdAt, row.id]);
}
```

The service owns the joins and the default-sort fallback; the framework emits
the `where` conditions, the `orderBy` expressions and the envelope. Offset mode
projects `count(*) over()` onto every row (`totalOver()`), so the page and its
total come back in one query.

The parameter is named **`input`** (or `query`), matching `XxxListInput`.

## Controller

```ts
@Get("orgs/:orgId/projects")
@ApiResponse({ status: 200, type: ProjectListResponseDto })
@ApiFilterQueries(projectList.filters)
@ApiPaginationQueries(projectList.pagination)
list(
  @Param("orgId") orgId: string,
  @Query() input: ProjectListDto
): Promise<ProjectListResponse> {
  return this.projects.list(orgId, input);
}
```

`nestjs-zod`'s `patchNestJsSwagger()` does not expand `@Query()` DTOs into
parameters, so the decorators are what make the inputs visible in Scalar.
`@ApiFilterQueries` renders one parameter per declared filter with an example
per op; `@ApiPaginationQueries` renders exactly the allowed modes' params;
`@ApiScopeQueries` and `@ApiSelectQuery` cover the scope pair and the `?select=`
projection. They are additive: runtime validation still comes from the zod
schema on the DTO. The shared grammar is documented once in the OpenAPI
`info.description`, so per-parameter descriptions stay about the field's domain
meaning.

## Adding a new list endpoint

1. Declare `<module>.filters.ts` with `defineFilters` + `defineListSpec`.
2. In `<module>.schemas.ts`, add `listInputSchema(spec)` and
   `listResponseSchema(spec, itemSchema)`; export both plus the inferred types.
3. Export the spec, schemas, and types from the domain barrel.
4. Add `<module>.list.dto.ts` and `<module>.list.response.dto.ts`
   (`createZodDto`), and export them from the dto barrel.
5. Implement `list` with `resolvePageQuery` + `filterConditions` +
   (`fetchOffsetPage` | `paginateKeyset`).
6. Wire the controller: the list-response DTO, `@ApiFilterQueries`,
   `@ApiPaginationQueries`, `@ApiPlatformErrors(ValidationErrors.FAILED)`.
7. Add the SDK client method and hook returning the envelope.
8. Test one filter per declared field, one sort case, and both page modes.

## Graph-specific deviations

- **No `?sort=`.** Graph lists are cursor-only over a fixed
  `(createdAt desc, id desc)` key, so a user-supplied sort would break cursor
  stability. No graph filter entry sets `sortable: true`.
- **Projection is `?select=`, not `?properties=`.** The `properties` JSONB
  column hosts the JSONB-path filter; response projection uses PostgREST's
  `?select=key1&select=key2`.

## Deliberately out of scope

- **Per-filter permission gating.** No `requires` field on the spec yet.
- **Case-sensitive string variants** (`startsWithCs`). ILIKE is the default;
  add strict variants when a real case asks.
- **An OData or RSQL adapter.** The spec already names columns, types, and
  allowed ops, so a later adapter would not touch consumers.
- **POST-body filters** (Prisma-style nested `where`). The URL grammar covers
  what we need.

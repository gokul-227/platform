# @aec-craft/platform-contracts

The single source of truth for the platform's wire shapes: zod
request/response schemas, `PlatformError` specs and catalogs,
the standings and permits that make up the authorization vocabulary,
list/filter specs, and the
LOCUS graph vocabulary. Framework-neutral: no NestJS, no HTTP client.

Add a shape here first; the API packages, the SDK, and the MCP descriptors then
bind to it. One definition per shape means no drift: the server validates
against it, the SDK types against it, the React hooks reuse the SDK types.

Everything is re-exported from the package root.

```ts
import {
  graphBatchInputSchema,
  GraphNodeErrors,
  PlatformError,
  orgList,
  type OrgListResponse,
  type OrgPermission,
} from "@aec-craft/platform-contracts";
```

## Layout

| Path                        | What lives there                                                     |
| --------------------------- | --------------------------------------------------------------------- |
| `src/common/errors/`        | `PlatformError`, the wire envelope, and the access / db / internal / validation catalogs |
| `src/common/filters/`       | `defineFilters`, `defineListSpec`, the operator grammar, and the input/response schema builders |
| `src/common/metadata/`      | the metadata KV wire shapes                                          |
| `src/common/resources.ts`   | the resource id catalog                                              |
| `src/directory/orgs/`       | org schemas, errors, filters, and the org half of the audit action map |
| `src/directory/projects/`   | the project mirror of the above                                      |
| `src/directory/users/`      | user schemas, errors, filters                                        |
| `src/files/`                | file/folder schemas, errors, filters                                 |
| `src/graph/`                | nodes, edges, the changeset, queries, and `vocabulary/` + `blocks/`  |
| `src/threads/`              | threads + `messages/`, `runs/`: schemas, errors, filters, SSE stream |
| `src/audit/`                | audit-log schemas, errors, filters, labels, vocabulary               |
| `src/tenancy/`              | orgs, projects, members, standings and permits                       |

## Lists

Every list endpoint declares one spec:

```ts
export const orgList = defineListSpec({
  filters: orgFilters,
  pagination: { modes: ["cursor", "offset"], default: "offset" },
  defaultSort: "name:asc",
});
```

`listInputSchema(spec)` builds the query shape (the pagination params of each
allowed mode, `?sort` on offset, one param per filter field);
`listResponseSchema(spec, item)` builds the envelope (`items` plus the page
meta of the allowed modes). Cursor pages carry `nextCursor`; offset pages carry
`page` / `pageSize` / `total` / `totalPages`. Filter values use the
PostgREST-style `op.value` grammar (`?name=startsWith.acme`,
`?standing=in.(owner,manager)`).

## Graph

**Scope** is a discriminated union on `type`: `{ type: "org", orgId }` or
`{ type: "project", projectId }`. Files and threads use the same discriminator.
For graph and files it is an SDK-side addressing shape rather than a wire
field: a collection names its scope in the path, and a by-id route reads it off
the row.

**Writes are one transactional changeset.** `graphBatchInputSchema` is the body
of `POST /orgs/:orgId/graph` and `POST /projects/:projectId/graph`:
`{ groupId?, nodes?: NodeOp[], edges?: EdgeOp[] }`, each op a
discriminated union on `op` (`create | upsert | update | delete`). Edge
endpoints are immutable, so an edge `update` touches only `type`/`properties`.

**Reads** stay split per kind: `graphNodeListInputSchema` /
`graphNodeResponseSchema` and the edge equivalents, plus the analytical
`query/` schemas.

**Vocabulary.** `GRAPH_VOCABULARY` exposes the canonical baselines
(`CANONICAL_NODE_TYPES`, `CANONICAL_EDGE_TYPES`, `CANONICAL_CLASS_ROOTS`,
`CANONICAL_BLOCK_KEYS`). `type` / `class` / edge-type are open strings at the
contract layer; non-canonical values are accepted and classified for drift
observability by the server.

## Threads

A thread is dual-scoped like a file: it lives in an org or in a project. Under
it sit an immutable `thread_message` log and a mutable `thread_run` lifecycle.
`threadRunStatusSchema` is the canonical status set; `TERMINAL_RUN_STATUSES`
are the states a run can end in, and `SETTLED_RUN_STATUSES` adds the
`requires_action` human-in-the-loop pause (what a poll loop waits for). Agent
config (`threadAgentConfigSchema`) is passed per run, not stored.
`threadRunStreamEventSchema` is the SSE union for the stream endpoint; tool
events carry the tool name only, never arguments.

## Scripts

```bash
pnpm --filter @aec-craft/platform-contracts build   # tsup -> dist (ESM + CJS + d.ts)
pnpm --filter @aec-craft/platform-contracts check   # tsc --noEmit
```

Downstream packages consume the built `dist`, so rebuild after changing a shape.

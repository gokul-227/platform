# `@aec-craft/platform-mcp-tools`

Typed MCP tool descriptors + manifest helpers for the Platform. This package is the **source of truth for which `apps/api` routes are exposed as MCP tools**: each descriptor names a tool, captures its input/output zod schemas (imported from `@aec-craft/platform-contracts`), and points at the `apps/api` route it dispatches to. Consumed by the `/mcp` endpoint in `apps/api` and any tooling that introspects the manifest (codegen, docs).

## What it gives you

- **`ToolDescriptor` / `defineTool`** — the typed declaration of one tool: `name`, `description`, `inputSchema`, `outputSchema`, `resource`, `endpoint` (`{ method, path }`, may be templated), `scopes`, and an optional `filterSpec`.
- **`ALL_TOOLS`** — the composed list of every first-party tool, built from per-domain folders under `src/` that mirror `apps/api`'s route layout.
- **`buildToolsListPayload` / `descriptorToManifestEntry`** — convert descriptors to the MCP `tools/list` wire shape, deriving JSON Schema from each zod `inputSchema` via `zod-to-json-schema`.
- **`describeFilterSpec`** — render a `FilterSpec` as a compact `Filters: … Sortable: …` prose line, auto-appended to a tool's description when it carries a `filterSpec`.
- **No runtime behaviour.** Descriptors are pure data; authorization and dispatch live in the `/mcp` endpoint. The `scopes` field is a dispatch-side fail-fast, not the source of truth — the resource server still enforces its own permission model.

`ResourceId` is currently just `"api"` (the only resource server). Schemas are the single source of truth: adding a filter op on a column in `@aec-craft/platform-contracts` auto-propagates into the tool descriptions.

## Install

```jsonc
// consumer package.json
{
  "dependencies": {
    "@aec-craft/platform-mcp-tools": "workspace:*",
  },
}
```

## Defining a tool

A descriptor reads its schemas from `@aec-craft/platform-contracts` and declares the endpoint to proxy to. `path` may contain `{placeholder}` segments; dispatch pulls matching input fields into the path, and sends the rest as query params (GET) or JSON body (POST/PATCH).

```ts
import {
  someListInputSchema,
  someListResponseSchema,
  someFilters,
} from "@aec-craft/platform-contracts";

import { defineTool } from "../descriptor";

export const someListTool = defineTool({
  name: "some_list", // snake_case, unique across the manifest
  description: "Plain-English purpose; the model reads this to decide whether to call it.",
  inputSchema: someListInputSchema,
  outputSchema: someListResponseSchema,
  resource: "api",
  endpoint: { method: "GET", path: "/some" },
  scopes: ["openid"],
  filterSpec: someFilters, // optional; appends the "Filters: …" line to the description
});
```

## Manifest

`McpService` calls `buildToolsListPayload(ALL_TOOLS)` once at boot to produce the MCP `tools/list` response:

```ts
import { ALL_TOOLS, buildToolsListPayload } from "@aec-craft/platform-mcp-tools";

const payload = buildToolsListPayload(ALL_TOOLS);
// { tools: [{ name, description, inputSchema /* JSON Schema */ }, …] }
```

- `inputSchema` is JSON Schema (openApi3 target, refs inlined), derived from the zod schema — deterministic, so the same descriptor always yields the same schema.
- When a descriptor has a `filterSpec`, the entry's `description` gets a generated trailing line, e.g. `Filters: type (eq, in); class (eq, startsWith); properties (hasKey, eq). Sortable: createdAt, name.`
- Outputs are deliberately **not** in the payload — MCP tool-call responses are `content`, not typed schemas. The response is still validated against `outputSchema` before being returned.

## Tool catalog

`ALL_TOOLS` composes `auditTools` → `fileTools` → `graphTools` → `orgTools` →
`projectTools` → `threadTools` → `userTools`, for 45 tools. The surface mirrors
the API rather than curating it: a route the API and the SDK both expose gets a
descriptor unless there is a reason it cannot work here.

A collection is addressed by a scope parameter (`files_list` takes `orgId` xor
`projectId`), and anything keyed by a row id stays flat (`files_get`), because a
row carries its scope on the row.

**Which routes have no tool is not listed here.** `apps/api`'s
`surface.coverage.e2e` reads the generated documents and fails if a tool points
at a route the server does not serve; the reasons a route stays out live beside
that gate, where they cannot go stale. What is deliberately absent, in one
sentence each: the file byte protocol (an agent cannot PUT to a signed URL), the
index write side (indexing follows from the preset), the retrieval primitive
under `search` / `context` / `ask`, membership (handing out standings is not
something to make easy), and the identity webhooks (a provider back-channel).

### Audit

| Tool | Endpoint | Notes |
| --- | --- | --- |
| `audit_events_list` | `GET /audit/events` | List audit events, newest first. |
| `audit_events_get` | `GET /audit/events/{eventId}` | Fetch one audit event by id, within the scope named. |

### Files

| Tool | Endpoint | Notes |
| --- | --- | --- |
| `files_list` | `GET /files` | List files and folders. |
| `files_folders_create` | `POST /files` | Create a folder. |
| `files_search` | `POST /files/search` | Search the indexed documents in one scope by meaning and get back the matching passages of text, each with its file, heading, page and score. |
| `files_context` | `POST /files/context` | Retrieve from the indexed documents in one scope and get one block of text with numbered `[n]` markers, plus a `sources` list mapping each marker to its file, heading and page. |
| `files_ask` | `POST /files/ask` | Ask the indexed documents in one scope a question and get a written answer with `[n]` citations, alongside the context and sources it was built from. |
| `files_get` | `GET /files/{fileId}` | Fetch one file or folder by id. |
| `files_download` | `GET /files/{fileId}/download` | Get a short-lived signed URL for a file's bytes, to fetch directly from storage. |
| `files_update` | `PATCH /files/{fileId}` | Rename a file or folder or move it to another folder (`parentId`, null for the root). |
| `file_metadata_set` | `PUT /files/{fileId}/metadata/{keyPath}` | Merge-write a single key into a file or folder's metadata bag. |
| `file_metadata_delete` | `DELETE /files/{fileId}/metadata/{keyPath}` | Remove a single key from a file or folder's metadata bag. |

### Graph

| Tool | Endpoint | Notes |
| --- | --- | --- |
| `graph_apply` | `POST /graph` | Apply a graph changeset in one transaction. |
| `graph_nodes_list` | `GET /graph/nodes` | List graph nodes. |
| `graph_nodes_get` | `GET /graph/nodes/{nodeId}` | Fetch a single graph node by id. |
| `graph_edges_list` | `GET /graph/edges` | List graph edges. |
| `graph_edges_get` | `GET /graph/edges/{edgeId}` | Fetch a single graph edge by id. |
| `graph_query` | `POST /graph/query` | Run a read-only openCypher query against a project's projected graph view (EXPERIMENTAL). |
| `graph_health` | `GET /graph/health` | Reachability probe: is the projected graph DB reachable (requires `read` on the project)? Always answers `{ reachable, engine, latencyMs }` — `engine` is the configured graph engine (memgraph / neo4j, or null when none is configured) and `latencyMs` is the measured connectivity round-trip (null when unreachable). |

### Orgs

| Tool | Endpoint | Notes |
| --- | --- | --- |
| `orgs_list` | `GET /orgs` | List organizations visible to the current user. |
| `orgs_get` | `GET /orgs/{orgId}` | Fetch a single organization by id. |
| `org_metadata_set` | `PUT /orgs/{orgId}/metadata/{keyPath}` | Merge-write a single key into an organization's metadata bag. |
| `org_metadata_delete` | `DELETE /orgs/{orgId}/metadata/{keyPath}` | Remove a single key from an organization's metadata bag. |

### Projects

| Tool | Endpoint | Notes |
| --- | --- | --- |
| `projects_list` | `GET /projects` | List projects visible to the current user across all their orgs. |
| `projects_get` | `GET /projects/{projectId}` | Fetch a single project by id. |
| `projects_create` | `POST /orgs/{orgId}/projects` | Create a new project under an organization. |
| `projects_update` | `PATCH /projects/{projectId}` | Update a project's name or slug. |
| `project_metadata_set` | `PUT /projects/{projectId}/metadata/{keyPath}` | Merge-write a single key into a project's metadata bag. |
| `project_metadata_delete` | `DELETE /projects/{projectId}/metadata/{keyPath}` | Remove a single key from a project's metadata bag. |

### Threads

| Tool | Endpoint | Notes |
| --- | --- | --- |
| `threads_list` | `GET /threads` | List the current user's chat threads in one scope. |
| `threads_get` | `GET /threads/{threadId}` | Fetch a single chat thread by id. |
| `threads_create` | `POST /threads` | Create a chat thread in an org or project scope. |
| `thread_metadata_set` | `PUT /threads/{threadId}/metadata/{keyPath}` | Merge-write a single key into a thread's metadata bag. |
| `thread_metadata_delete` | `DELETE /threads/{threadId}/metadata/{keyPath}` | Remove a single key from a thread's metadata bag. |
| `thread_messages_list` | `GET /threads/{threadId}/messages` | List a thread's messages, oldest-first. |
| `thread_messages_create` | `POST /threads/{threadId}/messages` | Append a message to a thread (e.g. |
| `thread_runs_list` | `GET /threads/{threadId}/runs` | List a thread's runs, newest-first. |
| `thread_runs_create` | `POST /threads/{threadId}/runs` | Start a generation run on a thread. |
| `thread_runs_get` | `GET /threads/{threadId}/runs/{runId}` | Fetch a run by id to poll its status and result. |
| `thread_run_metadata_set` | `PUT /threads/{threadId}/runs/{runId}/metadata/{keyPath}` | Merge-write a single key into a run's metadata bag. |
| `thread_run_metadata_delete` | `DELETE /threads/{threadId}/runs/{runId}/metadata/{keyPath}` | Remove a single key from a run's metadata bag. |

### Users

| Tool | Endpoint | Notes |
| --- | --- | --- |
| `me_get` | `GET /me` | Fetch the current user's profile (the identity behind the Bearer token). |
| `me_update` | `PATCH /me` | Update the current user's avatar. |
| `me_metadata_set` | `PUT /me/metadata/{keyPath}` | Merge-write a single key into your own metadata bag. |
| `me_metadata_delete` | `DELETE /me/metadata/{keyPath}` | Remove a single key from your own metadata bag. |

## Adding a tool

1. New file under `src/<domain>/<name>.ts` exporting a `defineTool({ … })` descriptor (see above).
2. Wire it into the domain's `index.ts` (`export { … }` plus the `<domain>Tools` array). `registry.ts` unions every domain into `ALL_TOOLS`.
3. `pnpm --filter @aec-craft/platform-mcp-tools build`, then restart `apps/api`. `tools/list` now includes it.
4. Add its row to the catalog above, or regenerate that section from `ALL_TOOLS`.

`apps/api`'s `surface.coverage.e2e` fails if a descriptor points at a route the server does not serve, so a tool cannot outlive its route. The reverse — a route nobody exposed — is a judgement rather than drift, and is stated in the catalog section above.

## Scripts

```bash
pnpm --filter @aec-craft/platform-mcp-tools build   # tsup → dist
pnpm --filter @aec-craft/platform-mcp-tools check   # tsc --noEmit
pnpm --filter @aec-craft/platform-mcp-tools test    # vitest (manifest + descriptor coverage)
pnpm --filter @aec-craft/platform-mcp-tools lint
```


# `@aec-craft/platform-sdk`

Typed HTTP client for the platform API. Promise-based, framework-neutral,
isomorphic (browser + Node 18+ + edge runtimes); uses global `fetch`.

One `PlatformClient` exposes every resource as a namespaced sub-client. Method
names mirror the server's CRUD vocabulary: `list`, `findById` (or `findByUser`
/ `findByName` when the route is keyed by something other than the row id),
`create`, `update`, `delete`.

## Entries

| Entry     | What it gives you                                                        |
| --------- | ------------------------------------------------------------------------ |
| `.`       | `PlatformClient` + the resource clients, `AgentClient` + `Session`, and the full re-exported wire surface |
| `./react` | TanStack Query hooks (`PlatformProvider`, `useOrgs`, …), the upload hooks (`useFileUploads`), and the chat binding (`AgentProvider`, `ChatProvider`, `useChat`) |
| `./ui`    | the scope-aware `<Settings>` modal and `<UploadDropzone>`, built on `@aec-craft/ui` |

`react`, `@tanstack/react-query`, `@tanstack/react-form`, and `@aec-craft/ui`
are optional peers; the root entry works without any of them.

## Layout

Domains hold one folder each, `common/` holds what they share, and `surfaces/`
holds cross-domain UI compositions. Every domain follows the same shape: the
resource clients at the top level, React bindings under `react/`.

| Path              | What lives there                                               |
| ----------------- | -------------------------------------------------------------- |
| `src/common/`     | `Http`, the query-string builder, scope helpers, the metadata clients, the provider + query keys |
| `src/tenancy/`    | orgs, projects, and who is in them                             |
| `src/users/`      | `me`: the caller's own profile, metadata and standings         |
| `src/files/`      | the file tree client, the index client, the upload engine (`upload/`) and its components (`ui/`); the engine's vocabulary lives in contracts |
| `src/graph/`      | nodes, edges, the changeset, openCypher queries                |
| `src/objects/`    | the `object` slice of the graph, read-only                     |
| `src/rules/`      | the `rule` slice of the graph, read-only                       |
| `src/analysis/`   | the named computations over a project's model                   |
| `src/threads/`    | threads, messages, runs, `Session`, `AgentClient`, the chat binding |
| `src/audit/`      | the audit feed client                                          |
| `src/platform/`   | seams the consuming app fills rather than API domains: `flags/` (the flag service's adapter) and `settings/` (tier resolution and preferences) |
| `src/surfaces/`   | `settings/` — the config-driven per-scope section registry      |

The staff surface is not here. `/admin/*` is
`@aec-craft/platform-admin-sdk`, a separate package so an internal console's
routes are not in the tarball a product team downloads.

## Client setup

```ts
import { PlatformClient } from "@aec-craft/platform-sdk";

const client = new PlatformClient({
  baseUrl: "https://api.example.com", // no trailing slash
  getAuthHeaders: async () => ({
    Authorization: `Bearer ${await getAccessToken()}`,
  }),
});
```

| Option           | Required | Purpose                                                                    |
| ---------------- | -------- | --------------------------------------------------------------------------- |
| `baseUrl`        | yes      | API origin, no trailing slash.                                             |
| `getAuthHeaders` | no       | Called per request; return the auth headers. Async is fine, so token refresh stays yours. |
| `defaultHeaders` | no       | Headers merged into every request (e.g. `X-Client-Name`).                  |
| `fetch`          | no       | Custom `fetch`; defaults to the global. Handy in tests and polyfilled envs. |

## Usage

```ts
// Lists return a paged envelope: { items, ... } plus the page meta of the
// mode that served the request.
const { items: orgs, total } = await client.orgs.list({ pageSize: 25 });
const org = await client.orgs.create({ name: "Acme" });
await client.members.add({ type: "org", orgId }, {
  email: "a@b.test",
  standing: "editor",
});

// Cursor mode, for feeds and infinite scroll.
let cursor: string | null | undefined;
do {
  const page = await client.threads.list(scope, { limit: 50, cursor });
  cursor = page.nextCursor;
} while (cursor);

// Graph writes are one transactional changeset.
await client.graph.apply({
  scope: { type: "project", projectId },
  nodes: [{ op: "create", type: "object", class: "element.door", name: "D-01" }],
});
```

// Analysis is a POST because the question is the body, but it reads: the same
// input returns the same answer, so the hooks cache it like a query.
const { spaces } = await client.analysis.egress(projectId, { storey: "L00" });

// The object and rule slices are facades over the same graph rows, narrowed to
// one node type. Reads only — a write is a changeset.
const doors = await client.objects.list(projectId, { class: "element.door" });

Failures throw `PlatformError`; switch on `err.code` (or compare against a
catalog entry like `OrgErrors.SLUG_TAKEN.code`) to handle specific cases. The
whole wire surface from `@aec-craft/platform-contracts` is re-exported here, so
consumers depend on this package alone.

## Uploads

`upload` runs the whole transfer and hands back controls; the bytes go straight
to the bucket, never through the API.

```ts
const upload = client.files.upload(
  { type: "project", projectId },
  file,                        // a browser File, or any Blob plus `meta.name`
  { parentId: folderId },
  { onProgress: ({ progress }) => setProgress(progress) }
);

upload.pause();
upload.resume();
const ready = await upload.done;  // the `ready` file, or a PlatformError
```

Small files go up in one signed request. Above the deployment's threshold the
server hands out an interruptible ticket — a chunked session or independent
parts, depending on its storage backend — and the engine sends the bytes
piecewise, which is what makes the rest possible: `pause()` keeps everything
already committed, a dropped connection parks the upload and continues when it
returns, and a fatal answer from storage (expired capability, provider size
limit) fails immediately instead of retrying into a hang.

An upload also survives the page. `client.files.resumeUpload(fileId, file)`
re-fetches the session and asks the bucket what it already holds, so re-picking
the same file continues rather than starts over. `client.files.abortUpload(fileId)`
gives up and drops the pending row; `client.files.presets()` is what the
deployment accepts — per-preset size and type limits, so a file can be rejected
before any of it is sent. Pass `preset` (on the upload meta, on `useFileUploads`,
or on either `./ui` surface) to be held to a named one at both ends rather than
only locally.

React gets the same thing with per-file state:

```tsx
const uploads = useFileUploads({ parentId, onUploaded: () => refetch() });
uploads.start(scope, files);            // each file uploads independently
uploads.pause(uploads.items[0].id);
```

Or take the whole surface from `./ui`: `<UploadDropzone scope={scope} />` for a
drop target, `<UploadButton scope={scope}>Add model</UploadButton>` where one
does not fit. Both render per-file rows with pause/resume/retry and offline
state; `<UploadAttachment>` is that row on its own, for a custom layout.

## Agent runtime

`AgentClient` is the same threads/messages/runs surface as
`PlatformClient.threads`, packaged standalone for apps that talk to the agent
and nothing else. Both expose `session()`:

```ts
const session = client.threads.session({ scope: { type: "project", projectId } });
const reply = await session.send("doors on floor 2?", { onToken: write });
if (reply.requiresAction) {
  await session.answer("the north stairwell");
}
```

A session does create-thread -> message -> run -> stream -> reply in one call
and resumes human-in-the-loop questions. To drive the primitives instead, use
`threads.runs.create` then `threads.runs.stream` (SSE) or `threads.runs.wait`
(poll); `threads.runs.submit` answers a parked question.

## React

```tsx
"use client";
import { useOrgs, useCreateOrg } from "@aec-craft/platform-sdk/react";

function OrgList() {
  const orgs = useOrgs();          // { data: { items, total, ... } }
  const createOrg = useCreateOrg(); // mutations auto-invalidate the lists
}
```

In Server Components skip the hooks and call the client directly:
`await platformClient.orgs.list()`.

## Scripts

```bash
pnpm --filter @aec-craft/platform-sdk build   # tsup -> dist (ESM + CJS + d.ts)
pnpm --filter @aec-craft/platform-sdk check   # tsc --noEmit
pnpm --filter @aec-craft/platform-sdk test
```

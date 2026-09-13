# Agent guide for the platform monorepo

Single source of truth for cross-repo conventions, shared across agent tools. Claude Code loads it via the `@AGENTS.md` import in `CLAUDE.md`. Keep it terse and project-specific; user-level preferences belong in `~/.claude/`.

Generic code quality (formatting, lint-level best practices) is enforced by Biome via ultracite; run `pnpm fix` before committing. This file is for the judgment a linter cannot encode: workflow, naming, and architecture.

Package-scoped rules live in that package's own `AGENTS.md`.

## Documentation lives in `aec-craft/docs`

Every document is written there and served at `/internal/platform/…`. None is
written here, because a page in a product repository cannot know whether it
duplicates a page in another one, or whether a change three repositories away made
it wrong — and neither can an agent that only sees this checkout.

**A change that needs a documentation change is two pull requests.** Pull
`aec-craft/docs`, find the page that covers what you changed, update it there, and
open it alongside this one. Do not write the explanation here instead. The
coordination cost is deliberate: it doubles as a review gate, because whoever owns
a document is not always whoever owns the service.

`AGENTS.md`, `README.md` and `.env.example` stay. They are instructions to whoever
is in the checkout, not documentation of the system.

## TODOs go to GitHub Issues

When you would otherwise write a new `TODO` or `FIXME` in source code, open a GitHub issue in this repo first and leave only a one-line pointer in the file.

**How to file the issue**

- `gh issue create` in `aec-craft/platform`. Assignee defaults to the repo owner (`--assignee @me`).
- Labels carry the type (`bug`, `enhancement`, `chore`) and, only when cross-cutting, an area (`security`, `docs`, `dx`, `performance`, `observability`, `accessibility`, `tech-debt`).
- The body should include the source file path and a line number, plus the scope and any context that would otherwise have lived in the code comment.

**How to mark the code**

- One line, comment-style for the language: `// TODO(#123): short reason this exists`, `# TODO(#123): ...`, `<!-- TODO(#123): ... -->`.
- A bare `// TODO:` is acceptable for a known gap that has no issue yet; add the number when one is filed.
- Do not leave multi-line TODO blocks with detailed context; that detail lives in the issue.
- Exception: if the TODO will be resolved within the current PR, use `// FIXME(this-pr): ...` and do not open an issue.
- Bare `#123` only, never `aec-craft/platform#123`: a cross-repo form creates a backlink from anywhere it is quoted.

## Documentation moves with the change

A change is not finished at the code. Whatever documents the thing you changed is
updated in the same pull request: the package `README.md` (routes, layout,
consuming), the spec in `docs/` it implements (`docs/graph.md`,
`docs/cognitive-building-model.md`), a route's summary and description, and this
file where it states the convention you just changed. A page in `aec-craft/docs`
is a second pull request there, opened alongside and linked from this one. A
removal or a rename is followed through everything that names it; grep for the
old name before opening the PR, because the checks catch a dead link and not a
sentence that is now wrong.

## Code comments

**One to three lines, or none.** A comment carries only what the code cannot: a
constraint from outside (a library, protocol or platform behaviour, named with
its version or config path), a choice against the obvious alternative, or the
symptom when the line is wrong. Configuration is held to the same bar, plus the
unit or budget a number came from. Say it once, next to its cause.

**When in doubt, delete.** The test is not whether a comment is true, it is
whether the next reader is worse off without it. If they are not, remove the
comment rather than reword it, and do that for comments you did not write: every
file you touch is in scope, which is the only way they stop accumulating. Delete
on sight:

- **Obvious**: it restates the line, the name or the type (`// increment the
  counter`, `// the user's id`, `@param userId The user id`).
- **Repetitive**: the fact is already in the symbol name, the file header, the
  DTO, or two lines above.
- **Narration**: `// Step 1`, `// now build the query`, `// --- helpers ---`.
  Structure is the code's job, not a banner's.
- **Irrelevant**: how the bug was found, what the code used to do, who asked for
  it, what a review thread said, why the approach is good.
- **Not applicable any more**: it names a flag, branch, table or library this
  file no longer has. It was true once, which is exactly why it misleads.
- **Simple**: a short pure function, a lookup table, a guard clause. Code that
  needs a comment to be read usually needs a better name instead.

Deleting loses nothing. A fact worth keeping goes into a name, a type, a test or
an issue, where it cannot go stale unnoticed. History belongs to git and the
issue tracker; an issue number appears in code only as a TODO pointer.

```ts
// Both or neither: the provider rejects `post_logout_redirect_uri` without
// `id_token_hint`, so a missing hint skips the hand-off rather than attempting it.
if (endSession && idToken) {
```

Not this, for the same line:

```ts
// Sign-out looked fine locally because the dev client had no post-logout
// redirect registered. On dev it started answering 400 invalid_request, and
// reading the provider's source showed it validates the pair together, so we
// first tried sending the redirect alone, then added the hint, and now both are
// set together, which is why this condition has two operands. See PR #53.
if (endSession && idToken) {
```

Both say the same thing. One is two lines and is still true next year.

A comment is part of the line it sits above: change one, change the other, and
delete it when its reason is gone. A stale comment is worse than none, because
it is read as current.

**Two exceptions, and only two.** A file header may take a second short paragraph
where one genuinely covers two constraints, so about six lines is its ceiling; and
a commented-out block in a template or example file is content rather than a
comment, since copying it is the point.

## Module-owned assertions

Business invariants worth *naming* live in their own file next to the service
that composes them, so `cat`-ing it gives the whole rule set for that module
without reading the transactional plumbing around it.

- `modules/<x>/<x>.assertions.ts` for invariants only that service composes
  (`assertNotSelfMutation`, `assertOrgNotLastOwner`). The function name is the
  spec.
- `common/assertions.ts` for the ones more than one module reaches for. That is
  the bar: more than one caller.
- A one-line guard nothing else will compose stays inline. Not every check gets
  a function; every named invariant does.

Reach for one when the check is data-dependent (the guard pipeline cannot
express it), or when it wraps a lookup plus a domain rule in one named call.

## Naming conventions

When you add or rename a symbol, follow these rules. When an existing name conflicts, prefer the documented canonical (or, if the rename is wire-breaking, track it as a deliberate change; see [Known exceptions](#known-exceptions)).

### Files

- **Entity-scoped files use dot separators**: `<entity>.<role>.ts(x)`: `graph.node.service.ts`, `file.index.controller.ts`, `org.member.controller.ts`. Not hyphens.
- **Generic, non-entity leaf files use kebab-case**: lib utilities, shadcn primitives, hooks (`safe-callback-url.ts`, `dropdown-menu.tsx`, `use-mobile.ts`).
- **Tiebreaker when unsure**: dot when the name's first word is a domain noun the file is about (`model.registry.ts`, `item.detail.ts`); kebab when it is a verb phrase, hook, or UI composition (`build-spatial-graph.ts`, `use-ifc-import.ts`, `canvas-empty-state.tsx`).
- **DB migrations are drizzle-kit output**, numeric-prefixed snake_case `.sql` (`0001_group_id.sql`), one chain and one journal per package; a domain-specific exception.
- **Singular entity prefixes**: `file.service.ts`, not `files.service.ts`.
- **Test files mirror their subject** and use the `.test.ts` suffix (never `.spec.ts`).
- **NestJS role suffixes**: `.service.ts`, `.controller.ts`, `.module.ts`, `.guard.ts`, `.middleware.ts`, `.dto.ts`.

### Discriminators, enums, domain fields

- **Variant/category discriminator key is `type`**, not `kind` (`z.discriminatedUnion("type", …)`). Discriminant type aliases are `*Type` (`PrincipalType`, `FileType`), not `*Kind`. Where the object already carries a domain `type`, the domain one is renamed rather than the discriminator: a Cypher relationship is `{ type: "relationship", edgeType: "CONTAINS" }`, and `kind` was the exception that bought.
- **State field is `status`** for domain models; `state` is reserved for UI render state in `@aec-craft/ui` primitives.
- **Enum string values are lowercase**; multi-word values are camelCase (`serviceAccount`), matching the graph edge-type vocabulary. Error codes are `UPPER_SNAKE`. Permits and standings are single lowercase words (`read`, `write`, `manage`, `admin`, `own`; `owner`, `admin`, `manager`, `editor`, `viewer`) — the colon-segmented `org:member:delete` form belonged to the retired permission catalog and should not come back. OAuth scopes are a separate vocabulary and stay as the provider spells them (`openid`, `offline_access`).
- **API/TS layer is camelCase** (`createdAt`, `userId`); the **DB layer is snake_case** (`created_at`, `user_id`). This boundary is intentional; do not "fix" migration columns.

### Booleans

- **Internal boolean variables and computed predicates take an `is`/`has`/`can` prefix** (`isLoading`, `hasChildren`, `canDelete`).
- **Keep the library's field name when re-binding**; TanStack Query state stays `isPending`/`isLoading`; never de-prefix to bare `pending`/`loading` or invent gerund synonyms (`inviting`, `saving`).
- **Bare adjectives only for props that mirror the DOM/ARIA**: `open`, `disabled`, `checked`, `selected`, `active`. Visibility props use `show*`.
- shadcn-native props (e.g. `isActive` on `SidebarMenuButton`) keep their upstream name.

### Functions

- **Verbs**: `create*` (production) / `make*` (test factories), `update*`, `delete*`, `findBy*` (entity lookup), `list` (collections), `get*` (computed/derived/session). Reserve `set*` for React state setters.
- **Event handlers**: `on*` for callback props, `handle*` for local DOM/library handlers, `*Handler` for route-handler factories.
- **No `Async` suffix**; rely on `async`/`Promise` typing.

### Types and symbols

- **No `I` prefix** on interfaces.
- **DTO classes use `Dto`** (not `DTO`). List DTOs are `<X>ListDto` (no redundant `Input`). Contract types use `*Input` / `*Response`.
- **Config-bag types are `*Options`** (not `*Opts`). HTTP query-shape types are `*Query` (not `*QueryParams`; reserve `*Params` for RPC).
- **Acronym casing**: `Id`, `Url`, `Api`, `Http`, `Db`, `Json`, `Ui`, `Sdk`, `OAuth`. Externally dictated names are left as spelled (`client_id`, `redirect_uri`, `aud`).
- **Provider modules**: export `XProvider` + a matching `useX` hook; the bundling wrapper that composes several providers is plural (`AccountProviders`).
- **Locals**: `config`, `message`, `ctx`, `options`, `error` (allow `err` only in `catch (err)`); route-handler params are `req`/`res`.
- **Constants**: module-level config/sentinels are `UPPER_SNAKE`.

### Known exceptions

These conflict with the canonical above but are **deliberately deferred** because changing them is wire-breaking (alters the JSON contract or emitted audit data). Do not auto-"fix" them; they need their own tracked change.

- **`admin` names two different authorities.** The `admin` standing and the `admin` permit are a tenant's own administrator; `admin-api` and `/admin/*` are the staff surface. They never meet on one route, because an admin-api route declares no permit at all, and the standing renders as "Administrator" so the word a person reads means one thing. Do not rename either half to resolve it: `admin` is the accurate word for a tenant's own administrator and for the one staff role alike, and `/admin` is the conventional path for an internal console.
- **`staffRole` is the identity estate's word.** `StaffGuard` reads `principal.staffRole`, a Kratos `metadata_public` field on a `staff` identity schema, surfaced through a published type in platform-id. Renaming it is an identity-schema migration across two repos, not a symbol rename, so the guard, the code and the claim all keep saying staff.
- **`Principal` stays, and `Caller` was considered.** `principal` is the conventional term for the authenticated caller at the policy layer (Kerberos, Java, .NET, Spring, AWS and GCP IAM) and `subject` is the conventional term at the token layer (`sub`, SAML, Kubernetes RBAC, Keto tuples). This repo uses both, correctly, at both layers. Renaming to `Caller` is a breaking release of `@aec-craft/platform-id-resource-nestjs`, so it rides the next break of that package alongside the `AUTHN_*` / `AUTHZ_*` sweep rather than going alone.
- **`AuthenticationErrors` and `AuthorizationErrors` still emit `ACCESS_*` and `PERMISSION_*` codes.** The catalogues were renamed from `AccessErrors` and `PermissionErrors` — "access" was vague because it mixed a 401 with a 403, and "permission" belonged to the retired permission catalog. The symbols are internal, so they moved; a `code` is a published, append-only identifier (`PlatformErrorSpec.code`), and every 401 and 403 the platform has ever answered carries the old prefix. `ACCESS_STAFF_REQUIRED` is the odd one: it is a 403 and now lives in `AuthorizationErrors`, so its prefix does not match its catalogue. Renaming the codes to `AUTHN_*` / `AUTHZ_*` is one tracked wire-breaking change, not a cleanup.

## API surface

Every API package publishes one OpenAPI document, and `apps/api` serves each as
its own portal. These rules are enforced by `apps/api/tests/e2e/api.conventions.e2e.test.ts`,
which reads the generated documents rather than the source; adding a package
puts it under the gate automatically, provided the package is bound in **both**
`apps/api/src/app.module.ts` and `packages/testing/src/app.ts`. A package missing
from the harness is invisible to every guard in that suite.

`apps/api/tests/e2e/surface.coverage.e2e.test.ts` is the second gate over the
same documents, and it is what keeps the SDK, the MCP tools and the API from
drifting: every published route needs an SDK method or a named reason it has
none, no reason may name a route the server no longer serves, and every MCP tool
endpoint must be a live route. The SDK half is **observed, not parsed** — several
clients build their path through a helper, so the source shows an interpolated
template rather than a route. Every method is invoked against a recording
transport and the URL it produces is what gets compared.

Adding or renaming one also means adding its path to the `useImportType: "off"`
override in `biome.jsonc`. A package outside that list gets its DTO imports
rewritten to `import type`, which erases `design:paramtypes`, and every `@Body`
and `@Query` on it silently stops being validated. `validation.wiring.e2e` is
what catches it.

### Naming a package

A package is named for **the URL segment it serves**, which is why some are
plural and some are not — the path is plural when it is a collection you list
and singular when it is one structure you address into.

| Package | Serves | |
| --- | --- | --- |
| `files-api` `objects-api` `rules-api` `threads-api` | `/files` `/objects` `/rules` `/threads` | many of a thing |
| `graph-api` | `/graph/nodes` | one graph; `nodes` and `edges` are the collections inside it |
| `audit-api` | `/audit/events` | `audit` is a namespace, `events` the collection |
| `admin-api` | `/admin/orgs` | `admin` is the surface, and every collection under it is another package's row |
| `analysis-api` | `/analysis/egress` | uncountable |
| `users-api` | `/me`, `/webhooks/identity` | named for the `user` row every surface is a view of |

Do not normalise this to all-plural or all-singular. Either choice puts the
package name at odds with its own routes, its `openapi-*` document path and its
tags, which all follow the same segment.

A package serving several segments is named for its domain only when those
segments are not one resource. `tenancy-api` is the one: `/orgs`, `/projects`
and the members inside them are one partition tree, and a project cannot be
created without an org to hold it. `users-api` is the counter-case and was the
test of the rule: `/me` and the identity webhook are both views of one `user`
row, so it keeps that row's name. It served `/users` until the admin view
moved to `/admin/users`, which admin-api serves through this package's
`UserService`. A new package that seems to need the `tenancy-api` exception is
probably two packages.

`group` is the authorization kernel's word and does not reach a client: the org
and project root groups are created server-side, and membership is served as
`/orgs/:orgId/members` and `/projects/:projectId/members`. A team spanning
projects arrives later as **Teams**, not as a group.

`@aec-craft/platform-authorization` is not in this table because it serves no
routes at all. It owns the `group` table and the Keto tuples, exposes
`AuthorizationService`, `@RequirePermit` and `@CurrentScope`, and publishes no
OpenAPI document — so it drops the `-api` suffix, which in this repo means "has
a portal". Every API package depends on it; nothing depends on a resource
package to get a guard. It owns the whole tree, reads and writes alike:
tenancy-api composes `createGroup` into the transaction that writes the org or
the project, and the member surface writes standings through it.

`@aec-craft/platform-graph-client` is the other routeless one: the bolt driver,
the engine dialect and one read-only session over the projection. Two packages
read that projection — graph-api serves `POST /graph/query`, analysis-api walks
it — and neither needs the other. Writing the projection stays in graph-api with
the tables it projects.

A package owns the table it serves, and the two that every slice touches are no
exception: `user` is users-api's and `audit_event` is audit-api's. A slice that
joins a name or records an event depends on that package. Both used to be
defined in `platform-common` so that nobody had to, which left the one package
with no domain owning two domains' tables.

A second axis looks contradictory and is not: the package is plural
(`files-api`) while its domain module class is singular (`FileModule`). One
names the URL, the other names the entity.

### Layout

- **`modules/` is flat, and the root is the root.** The package's own domain
  files sit directly in `modules/` (`modules/file.service.ts`,
  `modules/graph.module.ts`); only submodules get a directory
  (`modules/nodes/`, `modules/runs/`, `modules/index/`, `modules/extractions/`),
  and none nests inside another. A package serving several co-equal resources
  gives each one a directory instead (`modules/orgs/`, `modules/projects/`).
  Depth below a submodule is fine where the URL has it: `runs/metadata/`,
  `me/groups/`.
- Module files carry the domain prefix, which is what keeps the flat directory
  readable: `nodes/graph.node.controller.ts`, `runs/thread.run.service.ts`.
  Internal helpers do not (`graph-db/projection.session.service.ts`).
- The domain module class is **singular**: `FileModule`, `GraphModule`,
  `RuleModule`. The directory it lives in may be plural.
- A package owning no tables has no `database/` module and no root entry; only
  `./nest` is importable.

Every API package has the same skeleton, and a new one is a copy of it:

```
<name>-api/
  README.md                    h1, intro, ## Routes, ## Layout, ## Consuming
  package.json                 name, version, description, license, private,
                               type, [main, types], exports, files, [bin],
                               sideEffects, scripts, peer*, dependencies, dev*
  tsconfig.json tsup.config.ts vitest.config.ts
  [drizzle.config.ts drizzle/ bin/<name>-api-migrate.ts]   owns tables only
  src/config/api.module.ts     <Pkg>ApiModule; forRoot only when it has config
  [src/config/config.ts]       with forRoot
  [src/database/]              owns tables only
  src/modules/<entity>.{controller,service,module,dtos,errors}.ts
  src/modules/<submodule>/…    one directory per submodule, none nested
  [src/index.ts]               owns tables only: the framework-neutral surface
  src/nest/index.ts            the module, its services, the document
  src/nest/openapi.ts          <name>ApiDocument
  tests/{unit,integration,e2e}/
```

An error catalogue lives in the module that throws it and is named for it
(`events/audit.event.errors.ts` exports `AuditEventErrors`). A constructor
parameter is injected with an explicit `@Inject(Token)`, never by reflection,
because esbuild and swc emit no `design:paramtypes`.

**One controller per prefix, and the prefix names the collection.** Never
`@Controller()` with the path respelled on every route: a class serving two
roots is two classes (`@Controller("projects")` and
`@Controller("orgs/:orgId/projects")`), each holding only the dependencies its
own routes use. Route decorators then carry a suffix or nothing at all.

Every route documents its own path parameters with `@ApiPathParams(...)`, whose
table in `platform-common/nest` holds the descriptions, and declares what it can
refuse with `@ApiPlatformErrors(...)`. A description says what the route is for;
it never names a status code or an error code, because the decorator publishes
both.

### Routes

- **Nest when the row cannot exist without the scope; parameterise when the
  scope is a column on a row that exists on its own.** A membership is a
  membership *of* an org and a metadata key hangs off a row, so those nest
  (`/orgs/:orgId/members`, `/projects/:projectId/metadata/:keyPath`). A node, a
  file and an audit event each carry `org_id` and `project_id` and are one table
  either way, so the scope is a predicate: `/graph/nodes?projectId=`,
  `/files?orgId=`, `/audit/events?orgId=`, `/objects?projectId=`,
  `/rules?orgId=`, `orgId` xor `projectId`. A by-id read stays flat either way
  (`/graph/nodes/:nodeId`).
- Either shape authorizes the same: `resolveScopeRef` reads the scope from the
  path params or the query, and `PermitGuard` resolves the group and checks the
  permit before the handler runs. A request naming no scope is refused there, so
  a forgotten parameter is a 400 rather than an unscoped read.
- Path parameters are `<noun>Id`, plus `keyPath`. No other shape.
- **A static child of a collection registers before the parameter.** `GET
  /rules/extractions` and `GET /rules/{ruleId}` are one shape to a router, so
  whichever registers first wins: within a class, declaration order; across
  modules, the order of the `imports` array. Both are load-bearing and both are
  commented where they are relied on.
- **A segment with a `{param}` child is a collection, so it reads plural.**
  `/audit/events/{eventId}`, never `/audit/{auditId}` — a row is one thing that
  happened, not one audit. A singleton has no `{param}` child and stays singular
  (`/me`, `/projects/{projectId}/graph`, `/files/{fileId}/index`). `metadata` is
  the one exception: a keyed map on its parent, uncountable, with no list. The
  conventions gate asserts this.
- **An operation is not a collection.** `POST /projects/{projectId}/analysis/egress`
  computes over one project and returns no row, so it addresses the project in
  the path and always will. The rule above is about where rows live.
- `?scope=project|org` narrows a project list between its own rows and the
  inherited org library. That is **scope narrowing**, and it is a different thing
  from the scope *addressing* above: narrowing says how much of a scope to read,
  addressing says which scope. A parameterised collection takes both.
- A nested collection also settles what a create body carries: the partition is
  in the path, so `POST /orgs/:orgId/projects` takes a body with no `orgId` in
  it. A parameterised create reads its scope the same way, from the query.
  Where the service still needs both, the wire body and the service input are
  two schemas rather than one shape with fields a caller must not send.

### Documents

- Every controller-bearing module is named in the document's `include:` array.
  `deepScanRoutes` reaches one level past an entry and stops, so a module nested
  deeper is silently absent.
- Summaries are `<Verb> <object>`: "Get a project", "List a thread's runs". Not
  noun phrases.
- Descriptions open with the permit line — `**Requires \`read\` on the
  project.**` — then the prose. Name the resource, not its group: a caller
  holds a permit on a partition and the group is how the kernel stores it.
  `group` appears in a description only as a named request field (`groupId` in
  a body).
- Tags are `[<Scope> ]<Entity>`: `Files`, `Org files`, `Project graph nodes`.
- Every route declares the 401 it can answer; every `@RequirePermit` route
  declares 403. Both live in the class-level `@ApiPlatformErrors` baseline.

### Status codes

- `201` plus the created resource when a write creates one.
- `200` plus the resource when a write updates one.
- `204` when the write has no resource to return: a relationship written to the
  tuple store, an upload abandoned, a delete.
- `501` for a scaffolded route whose answer is not designed yet. A route that
  declares 501 is exempt from needing a success schema; nothing else is.

### Names

| Thing | Shape | Example |
| --- | --- | --- |
| Request DTO | `<Verb><Entities>Dto` | `CreateFileDto`, `ListFilesDto`, `RunAnalysisEgressDto` |
| Response DTO | `<Entity>ResponseDto` | `ThreadRunResponseDto` |
| List response DTO | `<Entity>ListResponseDto` | `FileListResponseDto` |
| Handler body param | `dto` | `@Body() dto: CreateFileDto` |
| Handler query param | `query` | `@Query() query: ListFilesDto` |
| Handler principal | `principal` | `@CurrentPrincipal() principal: Principal` |

A collection answers under `items`, never `data`.

**An input is named for the action; an output is named for the thing.** That is
the whole rule, and it is why the two halves look different. `ListFilesDto` is
what you send to list files — page, sort, filters — so the verb names it.
`FileListResponseDto` is a file list coming back, so the noun does. `List` reads
as a noun in the response and that is correct; it was the *input* that read as a
noun while denoting an action, which is why `FileListDto` was renamed.

A response whose shape exists only for one operation is named for that operation,
because it has no other name: `CreateFileResponseDto` is a file plus an upload
ticket, not a file. A response that is simply the resource is named for the
resource, because several operations return it — `FileResponseDto` answers `GET`,
`PATCH`, `POST .../complete` and both metadata writes.

Every DTO a module declares lives in one `<entity>.dtos.ts` beside its
controller. Not a `dto/` folder: 88 classes had spread over 112 files averaging
six lines, a third of them re-export barrels.

### Pagination and sorting

- Every list declares `modes: ["cursor", "offset"]`. The **default is the mode
  the list is read in**: cursor where rows are appended at the ordering key and
  a reader walks the whole thing (audit events, thread messages and runs, graph
  nodes and edges), offset where a person sorts, counts or jumps to a page
  (files, orgs, projects, users). Threads are offset despite being a feed,
  because the rail orders by `updatedAt` and a keyset over a mutable column can
  skip or repeat a row updated between two pages.
- `resolvePageQuery` picks the mode from the params — `limit`/`cursor` against
  `page`/`pageSize` — and only a request carrying neither gets the default.
  Flipping a default therefore changes what a param-less caller receives, and a
  cursor-defaulting list refuses a bare `?sort`.
- Pass the spec's own block to the decorator — `@ApiPaginationQueries(fileList.pagination)`
  — never the bare form, or the document stops tracking the contract.
- `sortable: true` is honoured in offset mode only. Cursor pages over a fixed
  keyset, and `resolvePageQuery` refuses `sort` alongside a cursor rather than
  ignoring it.

### Where things live

`packages/contracts` is the wire vocabulary the **SDK** builds against. That is
the test for anything you are tempted to put there, and the SDK is the only
consumer that counts: `mcp-tools` is private and ships inside `apps/api`, so it
may import an API package directly.

- **Two SDKs, split by audience.** `@aec-craft/platform-sdk` is what product
  teams install. `@aec-craft/platform-admin-sdk` covers `/admin/*` and depends on
  the first for its transport, so nothing about auth or error mapping is
  duplicated and an internal console's routes are not in the tarball a product
  team downloads. A staff route's client goes in the second one; there is no
  `./admin` entry on the first.

- **Filter specs stay in contracts.** They are wire vocabulary, not storage:
  the SDK's list signatures are typed from them. `OrgListInput`,
  `ProjectListInput` and `MemberListQuery` are `z.infer` of
  `listInputSchema(spec)`, so `orgs.list(query?: OrgListInput)` loses its
  parameter type the moment the spec lives somewhere the SDK cannot reach.
  The spec object itself is API-only — the SDK never names `defineFilters` or
  `graphNodeFilters` — but the type derived from it is public surface, and the
  two cannot be separated as this is built. The *machinery* is not here; see
  below.
- **Permit and standing vocabulary stays in contracts.** The SDK reads it.
- **The query dialect is `contracts/src/query`.** `defineFilters`,
  `defineListSpec`, the operator table, `listInputSchema`, the `?field=op.value`
  parser, both pagination modes, and the one predicate shape. The drizzle
  appliers sit in `common/src/drizzle/query`, behind
  `@aec-craft/platform-common/drizzle`, and must stay there: contracts publishes
  to clients, so a client must never pull a database driver to read a type.
- **Pagination is one file per mode, both halves in that package.** `page`
  settles which mode a request asked for; `page.cursor` and `page.offset`
  assemble the envelope (`fetchCursorPage`, `fetchOffsetPage`), and
  `common/drizzle/query/page.cursor` and `page.offset` emit the SQL each needs
  (`keysetWhere` and `keysetOrder`, `totalOver`). The two are deliberately the
  same shape — resolved query, a fetch closure, a row mapper, one mode-specific
  reader — so a list reads the same in either mode. A service composing a page
  by hand is the thing this replaced.
- **The error envelope and the shared catalogues are `contracts/src/errors`.**
  One copy, reached one way. `PlatformExceptionFilter` identifies a failure with
  `instanceof PlatformError`, so a second copy of the class in the same process
  answers 500 to everything — which is why this is a directory in the package
  every caller already depends on rather than a package of its own.
- **An error catalogue lives with the package that throws it.** No client
  switches on a code: the API answers `{ code, message, … }`, the SDK's HTTP
  layer turns that into a `PlatformError`, and callers render it. So
  `GraphNodeErrors` is exported from `@aec-craft/platform-graph-api`,
  `ThreadErrors` from threads-api, and `GroupErrors`, `OrgErrors` and
  `ProjectErrors` from tenancy-api, which serves all three resources.
- **One exception, and only one.** A catalogue lives in
  `contracts/src/errors` when `packages/common` itself throws it:
  `AuthenticationErrors`, `InternalErrors`, `ValidationErrors`, `AuthorizationErrors`, and
  no others. There is no "two packages throw it" exception any more — it existed
  for `OrgErrors` and `ProjectErrors`, which the authorization kernel named while
  masking a partition a caller may not see. The kernel no longer names either:
  the host passes the specs in as `AuthorizationModule.forRoot({ masks })`, keyed
  by `ScopeRef` type, so a routeless kernel holds no resource's vocabulary and
  the three catalogues live with the resources they describe.
- **A facade owns the codes it refuses with.** objects-api and rules-api read
  through the graph slice but answer `OBJECT_NOT_FOUND` / `RULE_NOT_FOUND`, and
  translate the store's `GRAPH_NODE_NOT_FOUND` on the way out. Letting a
  backing store's code through describes the store rather than the request.
  analysis-api is the counter-case: `GRAPH_QUERY_UNAVAILABLE` is honest there,
  because the analysis really does depend on the projection being reachable.
- **One `export *` per re-exported module.** A duplicate makes every shared name
  an ambiguous star export, and ES modules drop those silently — green build,
  quiet `tsc`, `exampleFor is not a function` at boot. `contracts/tests/reexport.test.ts`
  guards it.
- **Inside a package, import the module, not the barrel.** A sibling reached
  through its own package's `index.ts` re-enters that barrel while it is still
  initialising, so a composed zod schema sees `undefined` and fails as
  `Cannot read properties of undefined (reading '_parseSync')` at first parse.
  `selector.block.ts` importing `predicateSchema` from `"../../../graph"`
  instead of `"../../shared/predicate"` cost eleven tests. Both this and the
  rule above compile clean and only break at runtime.

### The query dialect is abstract

Nothing in `contracts/src/query` may name a table, a column, a class, an edge
type or a path prefix — not in code, not in a doc example. It declares what a
resource can be asked (`filter.spec`, `list.spec`), publishes that as zod
(`filter.schema`), parses `?field=op.value` (`filter.parse`, `filter.value`),
and settles and serves pagination (`page`, `page.cursor`, `page.offset`). The
drizzle half applies it (`common/src/drizzle/query`). Anything it cannot resolve
is refused through `failed()` as `VALIDATION_FAILED`, never guessed at.

It is a directory rather than a package because it had no audience of its own:
nobody installed it deliberately, and every consuming repository had to be
granted access to it in the registry before it could install contracts at all.

It once held the graph's aggregate compiler, which emitted `FROM graph_node` and
carried an identity-column map, and the CBM predicate vocabulary, which listed
`storey` and `space` as path prefixes. Those live where their callers are: the
predicate shape and the aggregate spec in `contracts/src/graph`, the compiler and
its cell readers in analysis-api. If something generic-looking needs a domain
noun to work, it is not generic.
- Everything else — services, guards, DTO classes, document specs — belongs to
  its package.

### MCP tool descriptions

A descriptor's prose is hand-written; anything mechanical is generated from the
schemas it already carries, because a hand-written duplicate drifts silently.
`describeFilterSpec` renders the filter allow-list from the `filterSpec`, and
`describeResponseEnvelope` renders the field list from the `outputSchema`. Do
not write either by hand: ten descriptions once claimed
``Returns `{ items, nextCursor }` `` and every one went stale the day lists
gained offset pagination.

## Tests

Suites live with the package they test, in three tiers: `tests/unit/` for what
needs nothing, `tests/integration/` for what needs the database, `tests/e2e/`
for what needs a booted host. Every `-api` package has all three; the two
routeless ones have no e2e, which is what "serves no routes" means. `apps/api`
keeps the host gates.

`vitest.config.ts` is two lines — `defineTestConfig()` from
`@aec-craft/platform-testing/vitest` — and that config does three things worth
knowing:

- **Every workspace specifier resolves to `src`.** A suite tests source, not the
  last build, so an edit needs no rebuild before a re-run. Anything outside
  vitest still reads `dist`: the host at runtime, the smoke scripts, `pnpm -r
  check`.
- **Files run one at a time.** The suites share one Postgres and truncate
  between tests. The root `pnpm test` serializes across packages for the same
  reason.
- **Coverage has a per-package floor**, measured rather than aspired to, in one
  map in that file. `pnpm test:coverage` enforces it. It is a ratchet: raise a
  number when a suite earns it, never lower one to make a run pass.

Fixtures come from `buildServices` and the `make*` helpers rather than from SQL,
so a test writes rows the way the product does. Keto and Postgres are real; the
bucket is the only fake.

## Graph model

The model spec is [`docs/cognitive-building-model.md`](docs/cognitive-building-model.md); the engine spec (storage, versioning, projection, REST) is [`docs/graph.md`](docs/graph.md). Read the model spec before changing anything in `contracts/src/graph`. The rules below are the ones that are easy to violate while writing code.

- **Three node types, never a fourth**: `object`, `rule`, `source`. Blocks are the real type system, so new capability arrives as a new block, not a new type. A verdict is a row; a document section is a `source`; a rule set does not exist.
- **Only `id`, `type` and `version` are immutable.** `parentId` must be mutable (re-parenting preserves identity; delete-and-recreate would destroy claims, verdicts and asserted edges). `class` may be refined within its root but never re-rooted, because the root resolves `type`; `assertClassRootStable` enforces it. A space's **use** lives in `programme.use`, never in the class leaf, so a change of use is a property write rather than a re-classification.
- **The identity core is closed.** Six fields (`id`, `type`, `class`, `name`, `version`, `parentId`) shared by every type. Never add a type-specific field to it, and never restate one of them inside a block. Granularity, genre, format and lifecycle all belong in `class` or a block. There is no `phase` field: status lives in `lifecycle`, the design-versus-as-built dimension lives on claims, and the phase to read is evaluation context.
- **One predicate shape and one operator vocabulary** across list filters, selector predicates, and rule constraints: `{ path, operator, value }` with `gte` `gt` `lte` `lt` `eq` `neq` `in` `notIn` `contains` `startsWith` `endsWith` `match` `exists` `notExists`. Do not invent a second comparison vocabulary (`min`/`max` was one).
- **An edge type is a verb phrase read source to target**, never a `has*` noun. Which end is the source follows the family: mereological edges are named from the part (`hostedIn`), functional ones from the actor (`bounds`, `serves`, `governs`), symmetric ones read both ways (`adjacentTo`). Symmetry, cardinality and transitivity are declared on the edge definition and never encoded in storage; symmetric writes canonicalise so `sourceId < targetId`, so a hand-written directed pattern against a symmetric type silently returns half the answer.
- **Standards references belong in the spec, not in code.** No `bot:` / IFC / LOCUS crosswalk comments anywhere; there is one table in the spec.
- **Derived state is disposable, asserted state is sacred.** Anything computed (topology edges, bindings, verdicts, aggregates, the projection, the resolved property bag) names its producer and is rebuildable. Never hand-edit it.
- **Fail closed.** Unknown operator, absent input, unreviewed rule, no matching case, no active constraint: `skip` or `error` with a reason, never `pass`. A gap is not compliance.
- **Vocabularies are open with canonical lists.** An unknown node type, edge type, class, block key or operator is accepted and counted as drift; it never throws and never silently passes a check.

The sibling `cbm-demo` and `locus-*` repos still carry the pre-rename vocabulary (`requirement`, `reference`, `hasRequirement`); the mapping is in the spec's Status section.

## UI components

`@aec-craft/ui` is the design system. It lives in its own repository (`aec-craft/ui`, locally `~/Dev/ui`) and is consumed here as a published GitHub Packages dependency; changes to primitives, blocks, or branding are made there and released via its changesets flow. It is organized in four layers:

- **`primitives/`**: shadcn primitives, pulled from the registry (`shadcn add ...`). When you customize a primitive vs the default shadcn output, document the deltas in a top-of-file comment.
- **`blocks/`**: shadcn-pattern compositions built on top of multiple primitives, used when the bare primitive needs additional UX scaffolding (toolbar, empty state, search/filter chrome). Examples: `data-table`, `empty-state`.
- **`custom/`**: product-specific components outside the shadcn lineage with no shadcn analogue. Example: `spinner`.
- **`branding/`**: brand marks and logotypes (the `buildos-*` mark/lockup/loader/wordmark family). Kept separate from `custom/` because these are pure brand assets, not reusable product UI.

Rules of the road:

- When the bare shadcn primitive feels insufficient, add a block on top of it. Do not rebuild the primitive.
- Use the canonical block from `@aec-craft/ui/components/blocks/*` everywhere. Do not write a per-app inline equivalent (no app-local data-table chrome, no app-local page header). If a block is missing a feature, extend the block in the ui repo.
- Components outside shadcn live in `custom/`, not in `primitives/`. If a shadcn equivalent exists (`toggle-group` covers `segmented`, etc.), use the shadcn primitive instead of inventing a parallel one.
- For local co-development against an unpublished ui change, point a root `pnpm.overrides` entry at `"@aec-craft/ui": "file:../ui"`; never commit that override. The ui repo is a single package at its root, not a monorepo, so there is no `packages/ui` path. Use `file:`, not `link:`: `ui` is transpiled from source and peers on react, and a bare symlink resolves react from the ui checkout, leaving two copies with separate context.

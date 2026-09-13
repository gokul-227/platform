# Graph

The module, plus versioning and the graph-DB projection. The graph engine
inside `apps/api`. This doc is the authoritative spec for the source-of-truth
model in Postgres, its versioning, and the synced graph-DB view that serves the
query classes Postgres is bad at.

**Two docs, split by layer.** This one is the engine: storage, versioning,
projection, sync, REST surface, permissions, migrations. What the nodes *mean* is
[`docs/cognitive-building-model.md`](cognitive-building-model.md), which is
authoritative for the vocabulary, the node types, the block and edge conventions,
the rule and verdict shapes, and the roots. Where the two overlap, the model spec
wins on meaning and this doc wins on mechanism.

The model spec renames two of the three node types (`requirement` → `rule`,
`reference` → `source`) and one edge type (`hasRequirement` → `governs`). The
canonical lists in `packages/contracts/src/graph` carry the new values; stored
rows and test fixtures still carry the old ones and classify as drift. The
sections below still describe the pre-rename vocabulary in places; the mapping
and the blast radius are in the model spec's Status section.

## What it is

A property-graph store for AEC building data, modelled on the LOCUS description
framework. Nodes carry identity and modular data blocks; edges are typed and
directed and may themselves carry data blocks. The platform hosts these graphs
under the existing org/project tenancy model; LOCUS itself is single-graph and
is implemented upstream in `@sparc/locus`.

Postgres is the system of record (SoR): every write lands there, and pure
property-filter reads stay there. A dedicated graph DB receives a one-way synced
view of the current state, used only for the traversal workloads (weighted
shortest path, connectivity, arbitrary-depth patterns) that recursive CTEs
handle badly. Every mutation also appends an immutable row to a version log,
which doubles as the sync feed.

Spec source: the LOCUS chapter (§4) of the CLARITY report. The report
describes LOCUS; this doc describes how the platform implements it.

## Position in the stack

- `packages/contracts/src/graph`: the source of truth for the wire surface.
  `registry/` is the kit a type declares itself with (`defineBlock`,
  `defineEdge`, the three structural types); `object/`, `rule/` and `source/`
  each declare their own class roots, blocks and edges and export a manifest;
  `vocabulary.ts` composes the three into the canonical lists, the classifier and
  `containmentEdgeFor`; `wire/` is what the API speaks, identical for every
  type. The LOCUS framework itself is specified upstream in the sibling
  `aec-craft/locus` repo; this is the platform's binding of it.
- `packages/graph-api`: the NestJS module. The changeset write surface at
  `POST /orgs/:orgId/graph` and `POST /projects/:projectId/graph`, collection
  reads beneath the same two scopes, flat by-id reads at `/graph/nodes/:nodeId`
  and `/graph/edges/:edgeId`, a `GraphAuthorizationService` that resolves scope from
  the row for by-id ops, plus the version log, the sync worker, and the
  project-scoped query surface.
- `packages/sdk/src/graph/`: the typed clients (`graph.client.ts`,
  `graph.node.client.ts`, `graph.edge.client.ts`, `graph.query.client.ts`) and
  the TanStack Query hooks under `react/`.

## Node model

Identity core, seven fields. Only `id`, `type` and `version` are immutable:

```
id        uuid          stable, immutable
type      text          discriminator (open string, see vocabulary below), immutable
version   text          server-assigned monotonic counter, immutable to callers
class     text          taxonomy dot-notation (open string); the leaf may be
                        refined, the root may not (see below)
name      text          display name; mutable
parentId  uuid | null   hierarchical parent within the same graph; mutable
phase     text | null   optional lifecycle phase; mutable
```

`class`, `name`, `parentId` and `phase` are all accepted by the `update` op.
`parentId` has to be mutable: re-parenting is how a model correction or a
federation match fixes a wrong storey without destroying the id, and with it the
node's history and every edge pointing at it.

`class` is the one with a rule. Its leaf may be refined (`space` to
`space.circulation`) but its root is fixed, because the root resolves the node's
`type` via `nodeTypeFromClass`, so re-rooting would change which blocks are valid,
which edges may attach and which rules bind, on an id that already has history.
`assertClassRootStable` rejects it with `GRAPH_NODE_CLASS_ROOT_IMMUTABLE` (409) on
both write paths that can rewrite `class`: the `update` op and an `upsert` onto an
existing row.

A node's `phase` is retained here but is being retired: the model spec drops it from
the core, because the design-versus-as-built dimension belongs on claims and the
review or legal status of a rule or source belongs in a `lifecycle` block. See
[`cognitive-building-model.md`](cognitive-building-model.md).

Plus per-row audit (`createdAt`, `updatedAt`), tenancy (`orgId`, `projectId`),
a single jsonb `properties` bag containing the data blocks, and a
`content_hash` column (sha256 of the canonical content image) powering
skip-if-unchanged writes.

### `type` and `class`

LOCUS specifies three structural types: `object`, `requirement`, `reference`.
The first segment of `class` determines the type, deterministically:

| Class root      | Resolves to type |
| --------------- | ---------------- |
| `space.*`       | `object`         |
| `element.*`     | `object`         |
| `building.*`    | `object`         |
| `site.*`        | `object`         |
| `requirement.*` | `requirement`    |
| `reference.*`   | `reference`      |

The platform exposes this mapping as `nodeTypeFromClass(cls)` in
`@aec-craft/platform-contracts`. Server-side, `type` is required on create but
is not validated against `class`. Callers may pass any type/class string;
canonical correctness is governance, not enforcement (see Vocabulary below).

`reference` is the LOCUS reference kind: laws, norms, datasheets, project specs.
File artefacts (PDFs, IFC files) are not graph nodes; they belong in a future
files module.

### `phase`

Optional. Free-form text at the API layer. The LOCUS taxonomy doc enumerates
allowed phases per type (`brief | design | construction | operation` for
objects, `draft | active | deprecated` for requirements, etc.) but enforcement
is a taxonomy concern, not the platform API's job.

### `properties` and data blocks

Single jsonb bag. Top-level keys correspond to LOCUS data blocks. Canonical
block keys, exported from `GRAPH_VOCABULARY.blockKeys.canonical`:

```
envelope    spatial extent (areas, heights, orientation)
programme   functional programming (activity, fixtures, use patterns)
material    layer build-ups, material catalogue references
finishes    surface treatments
systems     building services and systems
geometry    external geometry references
interop     mappings to IFC, BOT, BRICK, OmniClass, Uniclass
```

v1 supports full replacement of the bag on `update`. Per-block independent
mutation (LOCUS §4.4 "Jeder Datenblock ist unabhängig einsetzbar") is a tracked
follow-up (a patch endpoint).

A GIN index on `properties` backs `?` (key existence) and `@>` (containment)
predicates; the framework's JSONB-path filter exposes them as
`?properties=hasKey.envelope` (cheap key-existence check) and
`?properties->envelope->netArea=gte.5` (path-walked comparison).
`propertyKeys` is computed at read time via
`array(SELECT jsonb_object_keys(properties))`.

## Edge model

```
id         uuid
sourceId   uuid    immutable
targetId   uuid    immutable, must differ
type       text    free-form, canonical list below
version    text    server-assigned monotonic counter
properties jsonb   data blocks on the edge itself
orgId      uuid    NOT NULL
projectId  uuid | null
```

Canonical edge types (from `GRAPH_VOCABULARY.edgeTypes.canonical`):

```
object    contains bounds adjacentTo connectsTo hostedIn interfaceOf serves
rule      governs modifies
source    includes cites amends supersedes
```

Each is a `defineEdge` declaration in its type's `edges/` folder, carrying its
endpoint classes, cardinality, symmetry, transitivity and origin. `contains` and
`includes` are the same column (`parentId`) mirrored for two different trees, the
spatial one and a document outline; the projection picks between them by the
child's class root.

Open extension is allowed by design; LOCUS §4.5 spells this out ("Werkzeuge, die
unbekannte Kantentypen sehen, ignorieren sie; der Kernrahmen bleibt stabil").
Project-specific relations (e.g. `hasOwner`, `suppliedBy`) ship without schema
change.

Endpoints are immutable after creation; rewiring means delete + recreate.
Self-loops are rejected. Cross-org edges are rejected. Cross-project edges
within the same org are rejected.

## Scope

Single-table model with `(orgId, projectId)` deciding scope:

- `orgId NOT NULL, projectId NULL` → org-scoped (shared across the org)
- `orgId NOT NULL, projectId NOT NULL` → project-scoped

Public/system nodes are deferred; they would land in their own table when
needed, since they have a different ACL and lifecycle.

The composite FK `(projectId, orgId) → project(id, orgId)` is what enforces that
a project-scoped node's `orgId` matches its project's parent org. Postgres MATCH
SIMPLE (the default) skips the check when `projectId IS NULL`, which is what we
want for org-scoped rows. This requires a UNIQUE constraint on
`project(id, orgId)`; migration `006_node` installs it as a prerequisite.

Parent visibility rules:

- Org-scoped node: parent must be org-scoped in the same org.
- Project-scoped node: parent may be in the same project OR org-scoped in the
  parent org.

Cross-org and cross-project parents are rejected at the service layer with
`GRAPH_NODE_PARENT_CROSS_SCOPE`.

### Project lists hydrate by default

The project collection (`GET /projects/:projectId/graph/nodes`) returns project-scoped
rows **and** org-scoped rows visible from the parent org (UNION at the service
layer). This matches "what can I reference from here?" semantics: an agent that
opens a project sees the project's own contribution plus the inherited org
library in one call. The `?scope=` query param narrows: `project` returns
project-only, `org` returns only the inherited library. The org collection
(`GET /orgs/:orgId/graph/nodes`) returns org-scoped rows only (no hydration
upward; org is the top of the tree), and takes no `?scope=`, which is why it has
its own input schema.

### By-id reads resolve scope from the row

`GET /graph/nodes/:nodeId` and `GET /graph/edges/:edgeId` stay flat while the
collections nest. The server reads `(orgId, projectId)` off the row, derives the
scope (`projectId IS NULL` = org-scoped, otherwise project-scoped), and enforces
the matching read permission. The same route works regardless of which scope the
row lives in.

That split is deliberate. A row's group is a column, not its partition: a
contractor's model lives in a project and belongs to the contractor, so a nested
by-id URL would assert the project is the authority over it, and would break
again the moment a row moves group. Collections have no such problem, because a
collection *is* the partition.

Writes are different again: they go through the changeset, which applies to the
one scope its URL names, so every op is scope-strict against it — an
`update`/`delete` whose id lives outside that scope is a not-found, never a
cross-scope write.

A principal who isn't a member of the row's scope sees `GRAPH_NODE_NOT_FOUND` /
`GRAPH_EDGE_NOT_FOUND`, never `FORBIDDEN`; the API does not reveal existence to
outsiders.

## Vocabulary: open with canonical guardrails

LOCUS specifies node type as a closed three-value enum and edge type as
open-extensible. We apply a single uniform pattern across all four vocabularies
(node type, edge type, class root, block key) instead:

1. **Open string at the contract layer.** All four are `z.string().min(1).max(N)`
   with `.describe()` pointing at the canonical list.
2. **Canonical lists as exported constants** in
   `@aec-craft/platform-contracts/src/graph/vocabulary.ts`:
   - `CANONICAL_NODE_TYPES = ["object", "rule", "source"]`
   - `CANONICAL_EDGE_TYPES` = the thirteen above, composed from the manifests
   - `CANONICAL_CLASS_ROOTS = ["site", "building", "storey", "space", "element",
"interface", "rule", "source"]`
   - `CANONICAL_BLOCK_KEYS = ["envelope", "programme", "material", "finishes",
"systems", "geometry", "interop"]`
3. **`GRAPH_VOCABULARY` manifest** bundles the four constants with per-value
   descriptions, plus the class-root → type mapping. SDK consumers import it
   once: `client.graph.vocabulary` or `useGraphVocabulary()`.
4. **`classifyVocabulary(kind, value)`** returns `"canonical" | "experimental"`.
   Used by the service layer.
5. **Soft observability.** The service hook `classify(kind, value, orgId)`
   increments `vocabulary_experimental_total{kind,value,orgId}` on miss and logs
   a structured warning; **never throws**. Non-canonical values are accepted by
   design — extension is the path of least resistance.

Promotion path: when an experimental value proves useful, add it to the constant
in `platform-contracts` and ship a new version. The constants are the living
changelog. When the platform grows to per-org canonical extensions, runtime
vocabulary admin, or opt-in strict enforcement, this layer-of-code is the
migration target. Out of scope for v1.

## Permissions

There is no graph-specific permission and no node/edge split. A row answers to
the group in its `group_id` column, and every graph route asks the one question
the rest of the platform asks: does this subject hold this permit on that group.
`read` to look, `write` to change, and `write` covers update and delete alike,
so a changeset needs no per-op union.

The org/project distinction is real, but it is a partition rather than a
permission: an org-scoped row and a project-scoped row are reached through
different collections and usually belong to different groups. Which group a row
answers to is a column on the row, not something derived from the URL, which is
what lets a contractor's model live in a project and belong to the contractor.

## Versioning

Every node/edge mutation appends one immutable row to the append-only
`graph_version` table in the same transaction as the canonical-row write. There
is no separate change-log, revision, or delta concept: the version row carries
the **full post-state snapshot** as jsonb, and "history" is just the set of
version rows for an entity. The current state always lives in `graph_node` /
`graph_edge`; the version log never participates in latest-state reads.

```sql
CREATE TABLE graph_version (
  seq          bigserial PRIMARY KEY,   -- global order; sync + as-of cursor
  entity_type  text NOT NULL,           -- 'node' | 'edge'
  entity_id    uuid NOT NULL,           -- no FK: history outlives the row
  op           text NOT NULL,           -- 'created' | 'updated' | 'deleted'
  version      text NOT NULL,           -- entity counter after the op
  org_id       uuid NOT NULL,
  project_id   uuid,
  group_id     uuid NOT NULL,           -- who the row answers to
  actor_id     uuid,                    -- who changed it: user.id, null for a machine
  content_hash text,                    -- sha256 canonical image
  snapshot     jsonb,                   -- full node/edge image; NULL on delete
  created_at   timestamptz NOT NULL DEFAULT now(),
  synced_at    timestamptz              -- NULL = graph projection pending
);
```

One table for both entity types (an event log, not an entity store; matches the
polymorphic `audit_log` precedent). `content_hash` is mirrored onto the
current-state tables.

Key properties:

- **Granularity**: one row per _changed entity_ per transaction (never a model
  snapshot). Storage grows with edit rate, not model size. A 10k-node IFC import
  writes 10k rows in one transaction; a rename writes one.
- **Skip-if-unchanged**: services hash the would-be content
  (`type/class/name/parentId/phase/properties` for nodes;
  `sourceId/targetId/type/properties` for edges; identity/scope/version/
  timestamps excluded) and compare against `graph_node.content_hash`. Equal hash
  = no write at all (no version bump, no row, nothing recorded).
- **Reads**: latest state = the current-state tables (no version filters
  anywhere). History of one entity = `WHERE entity_id = X ORDER BY seq`. Model as
  of seq N = latest snapshot per entity with `seq <= N`, a single SQL query (no
  replay, since snapshots are full images).
- **Cascade caveat**: node deletion cascades its edge rows in Postgres WITHOUT
  edge tombstones; the node tombstone maps to `DETACH DELETE` graph-side, which
  removes the relationships too, so the views stay consistent.
- **Audit**: by decision, graph mutations write NO
  `audit_log` rows (volume); `actor_id` on the version row carries
  who-did-what. It holds the platform's own `user.id` rather than the identity
  subject, so the trail survives an identity-provider swap, and it is nullable
  because a worker or a machine has no profile to name.
- **Retention/compaction** (dropping old version rows, anchored on a future
  commit/checkpoint concept) is a future policy, not built yet.

## Graph-DB projection + sync worker

The version log **is** the sync feed: a 500ms in-process poller claims unsynced
rows and projects them as idempotent Cypher into the graph DB. There is
deliberately NO separate outbox table, no CDC replication slot. The version row
is domain data written in the same transaction anyway, is naturally ordered,
replayable forever, and needs no compaction cron.

The graph DB is a **disposable, current-state-only projection** — a single
shared instance per env with org/project on every node. Time-travel is never
stored graph-side; a historical state is reconstructed from `graph_version` by
SQL and (if needed) re-projected on demand.

### Engine

**Memgraph** (`memgraph/memgraph-mage` container), the same engine for local dev
and deployed:

- **Local dev**: `compose.graph.yaml`, bolt on 7687, plaintext/authless.
- **Deployed**: a Compute Engine VM running the same container
  (`docker run -p 7687:7687`), persistent SSD, reached over the VPC connector.

Memgraph is BSL-licensed (free) and in-memory; because the projection is
rebuildable from `graph_version`, one un-replicated VM is fine. See the
[Memgraph deployment docs](https://memgraph.com/docs/deployment).

**Swap target at scale**: the shared graph DB holds every org/project per env,
so if its in-memory footprint outgrows a VM's RAM, swap to disk-based **Neo4j
Enterprise on CE** (the
[Neo4j-on-GCP guide](https://neo4j.com/docs/operations-manual/current/cloud-deployments/neo4j-gcp/),
module `github.com/neo4j-partners/gcp-tf-neo4j`) by flipping `GRAPH_DB_ENGINE`.
The sync code is engine-agnostic; only the algorithm dialect differs. Per-project
sharding is the other escape hatch.

**Memgraph-committed projection shape**: LOCUS capability blocks project as
nested **map properties** (`n.envelope.volumeNet`, block inventory via
`keys(n)`, one block via `RETURN n.envelope`). Neo4j cannot store map property
values, so a Neo4j swap now also requires reverting `sync/cypher.ts` to
flattened scalar keys; that is a resync of derived state, not a migration.

### Architecture

```
              ┌──────────────────────────────────────────────────────────────────┐
              │ apps/api  (NestJS, Cloud Run, min:1 in prod)                     │
              │                                                                  │
 client       │  ┌────────────────────────┐                                      │
 ── REST ────►│  │ GraphNodeService /     │  one drizzle transaction:            │
              │  │ GraphEdgeService       │   1. canonical row (insert/update/   │
              │  │  (skip-if-unchanged    │      delete on graph_node/_edge)     │
              │  │   via content_hash)    │   2. graph_version row (full post-   │
              │  └───────────┬────────────┘      state snapshot + actor)         │
              │              ▼                                                   │
              │     ┌─────────────────────────┐                                  │
              │     │ Postgres (SoR)          │                                  │
              │     │  ├─ graph_node          │  current state, 1 row/entity     │
              │     │  ├─ graph_edge          │                                  │
              │     │  └─ graph_version       │  append-only history = sync feed │
              │     └───────────┬─────────────┘                                  │
              │                 │ WHERE synced_at IS NULL                        │
              │                 │ ORDER BY seq LIMIT 100                         │
              │                 │ FOR UPDATE SKIP LOCKED                         │
              │  ┌──────────────┴─────────┐                                      │
              │  │ GraphSyncWorker        │  500ms self-rescheduling tick;       │
              │  │  (in-process)          │  Cypher batch in ONE bolt txn,       │
              │  │                        │  then synced_at = now()              │
              │  └──────────────┬─────────┘                                      │
              │                 │ bolt://                                        │
              │  ┌──────────────┴─────────┐                                      │
              │  │ GraphQueryService      │◄── POST …/graph/query  (free Cypher) │
              │  │  (reads only)          │◄── GET  …/graph/health (reachable?)  │
              │  └──────────────┬─────────┘                                      │
              └─────────────────┼────────────────────────────────────────────────┘
                                ▼ bolt:// (deployed: via VPC connector)
                 ┌────────────────────────────────────┐
                 │ Memgraph (memgraph-mage)           │
                 │  ├─ local dev: compose.graph.yaml  │
                 │  └─ deployed: CE VM (europe-west3) │
                 │ Neo4j Enterprise on CE = swap      │
                 │  target at scale (disk-based)      │
                 │                                    │
                 │ Nodes: :Node + :<Type> +           │
                 │   :<ClassRoot> + :Org_<id> +       │
                 │   :Project_<id>; scope ALSO as     │
                 │   projectId/orgId properties       │
                 │   (queries filter on properties)   │
                 │ Relationships: CONTAINS,           │
                 │   HAS_REQUIREMENT, BOUNDS,         │
                 │   ADJACENT_TO, SERVES, ...         │
                 └────────────────────────────────────┘
```

### Sync mechanics

- **Worker**: `GraphSyncWorker`, in-process in `apps/api`, self-rescheduling
  500ms `setTimeout` chain (no `@nestjs/schedule`; ticks never overlap). One tick
  = one drizzle transaction: claim ≤100 rows, translate to Cypher
  (`src/modules/graph/sync/cypher.ts`), execute the whole batch in ONE bolt write
  transaction, mark `synced_at = now()`, log `{events, cypherMs, lagMsOldest}`.
  Crash before commit → rows unlock → next tick re-emits; Cypher is idempotent
  (at-least-once with consumer-side idempotence via MERGE).
- **Why `synced_at` + SKIP LOCKED instead of a watermark cursor**: bigserial
  values become visible out of commit order, so a cursor would skip rows. The
  claim pattern is multi-instance safe and crash-rollback safe.
- **Cypher shape** (engine-agnostic): nodes `MERGE (n:Node {id}) SET n = $props`
  (full property replacement, so removed keys disappear) + sanitized labels;
  `parentId` mirrors as a `{fromParentId: true}` relationship typed by the child's
  class root, `CONTAINS` for the spatial tree and `INCLUDES` for a document
  outline (rewired on every upsert, never touching explicit containment edges). Edges MERGE _stub_
  endpoints (out-of-order tolerant), then delete-by-id + CREATE (relationship
  types can't be altered; the bolt transaction makes the pair atomic). Deletes:
  `DETACH DELETE` / delete-by-id.
- **Engine dialects** (`packages/graph-client/src/dialect.ts`, the ONLY file
  where engines diverge): Memgraph uses `*wShortest` (impassable edges get a
  prohibitive weight; `wShortest` has no relationship filter), `*BFS`
  reachability, and MAGE `weakly_connected_components`. The Neo4j dialect maps
  these onto `apoc.algo.dijkstra`, `shortestPath`, and GDS WCC for the swap path.
- **Degradation instead of gating**: the graph modules are always registered so
  `POST /projects/:projectId/graph/query` exists (and is documented) on every deployment. Without
  `config.graphDatabase` (`GRAPH_DB_URI` on apps/api) the driver token is null:
  queries answer 503 `GRAPH_UNAVAILABLE`, the sync worker stays dormant, no
  bolt connection is opened, and the version feed accumulates harmlessly until a
  graph DB appears, then the worker catches up from seq 0.
- **Replay / rebuild / engine swap**: stand up the new engine, re-project by seq
  range (ignoring `synced_at`; idempotent MERGE makes re-reads harmless), cut
  reads over. The graph DB is disposable by construction.

## Query + health surface

Two routes ship today; both are read-only and scope-checked fail-closed:

```
POST /graph/query?projectId=             read on the project           free-form read-only Cypher
GET  /graph/health?projectId=            read on the project           graph-DB reachability probe
```

Both are project-scoped, and the query one is fenced to that project by
construction rather than by inspection.

- **`POST /graph/query?projectId=`** runs free-form Cypher against the projection.
  Every node pattern must carry `:Scoped`, which the server substitutes for the
  `Scope_<projectId>` label the sync worker writes on every row; a pattern
  without it, a caller-written `Scope_`/`Org_`/`Project_` label, and a
  variable-length hop are all refused before execution. Filtering results
  afterwards cannot work on its own — `MATCH (n) RETURN count(n)` names no
  partition and returns no entity, which is how the endpoint leaked (#186). The
  cost of a single label is that a Cypher read does **not** see the org's shared
  library: Memgraph rejects a disjunction beside another label, and the list
  routes hydrate the library anyway. Write clauses are rejected. Experimental,
  for the exploration phase. Returns 503 `GRAPH_UNAVAILABLE` on envs without a
  graph DB configured.
- **`GET /projects/:projectId/graph/health`** is a graph-DB reachability probe: it answers only "is
  the graph DB reachable". It does not lint structure, find orphans, or detect
  cycles.

Typed traversal routes (egress / connectivity) are future work. They
were built once, then folded back; their engine-dialected algorithm Cypher lives
on in `graph.dialect.ts` for the smoke checks and the future validator, and they
return as typed routes once usage patterns settle.

### Workloads

Three workloads motivate the graph DB, in order of how often they fire:

1. **"All rooms in project X with class Y"** — pure relational filter. Stays on
   Postgres.
2. **"Egress distance from room R to the nearest fire escape"** — weighted
   shortest path (LBO BW: 35m max travel distance). Via `POST /projects/:projectId/graph/query` for
   now (`*wShortest` on Memgraph); becomes a typed route later.
3. **"Are all habitable rooms reachable from a fire escape?"** — connectivity.
   Same: free Cypher now, typed route later.

Recursive CTEs cover (1) trivially, (2) painfully, (3) approximately (O(V²) above
~10k nodes). Dedicated graph engines deliver these as one-line calls.

## REST surface

Graph is a first-class domain. Writes are one transactional changeset over both
kinds; reads stay split per resource (the shapes and filters differ).

```
POST /orgs/:orgId/graph                 write   changeset over the org library
POST /projects/:projectId/graph         write   changeset over the project
GET  /orgs/:orgId/graph/nodes           read    list, scope from the path
GET  /projects/:projectId/graph/nodes   read    list, scope from the path
GET  /graph/nodes/:nodeId               read    read, scope from the row
GET  /orgs/:orgId/graph/edges           read    list, scope from the path
GET  /projects/:projectId/graph/edges   read    list, scope from the path
GET  /graph/edges/:edgeId               read    read, scope from the row
```

The permit is held on the collection's own group, or on the `groupId` the
changeset body names when it names one.

The changeset takes `{ groupId?, nodes?: NodeOp[], edges?: EdgeOp[] }`. Each op is a
discriminated union on `op` (`create | upsert | update | delete`); a single
mutation is an array of one. Every op in a changeset is a mutation and `write`
covers all of them, so there is one permit to check rather than a union derived
from the body. One call is one transaction:
either every op applies or none does. The server orders the transaction node
writes -> edge writes -> edge deletes -> node deletes, so a node and the edges
touching it (referencing it by a client-supplied id) ride in the same call; an
edge write onto a node the same changeset deletes is rejected with
`GRAPH_BATCH_EDGE_ENDPOINT_DELETED`.

Per-op semantics: `create` rejects an existing id with
`GRAPH_{NODE,EDGE}_BATCH_ID_CONFLICT`; `upsert` is create-or-replace by id, idempotent
(skip-if-unchanged by content hash); `update` replaces fields and bumps the
version (edge endpoints immutable); `delete` is scope-strict and cascades a
node's edges.

Where the scope comes from:

- **collections** name it in the path (`/orgs/:orgId/graph/nodes`,
  `/projects/:projectId/graph/nodes`). Query: `scope=project|org` narrows the
  project list's hydration of the org library; then the framework filters
  (`?type=in.(...)`, `?class=startsWith.space.`, `?phase=eq.design`,
  `?parentId=eq.<uuid>`, `?properties=hasKey.envelope`,
  `?properties->envelope->netArea=gte.5`, `?createdAt=gte.2026-01-01`); `limit`
  and `cursor` for pagination; `?select=key1&select=key2` (repeatable) to project
  top-level keys of the `properties` bag.
- **changesets** land in the collection they are posted to. The endpoints
  (`sourceId`, `targetId` for edges; `parentId` for nodes) are validated to be
  visible from there.
- **by-id reads** take just the id. The server reads the row and derives the
  scope from it. There is no by-id write: every mutation is a changeset.

Pagination: cursor-based, `limit` 1 to 200 (default 50). Cursor is opaque,
base64url-encoded `{createdAt, id}`. Bad cursor degrades to page one rather than
400, to avoid surfacing confusing errors on round-trip mangle.

Property projection: `?select=envelope&select=programme` includes only those
top-level keys of the `properties` bag (missing → `null`). Omitting returns the
full bag. `properties` itself is reserved for the JSONB-path filter (e.g.
`?properties=hasKey.envelope`).

## SDK shape

`list` and `create` take a `GraphScope` as their first arg (scope is intrinsic to
those operations). `get` / `update` / `delete` take only the id — the server
resolves scope from the row.

```ts
type GraphScope = { type: "org"; orgId: string } | { type: "project"; projectId: string };

const client = new PlatformClient({ baseUrl, getAuthHeaders });

client.graph.nodes.list({ type: "project", projectId }, { type: "object" });
client.graph.nodes.create(
  { type: "org", orgId },
  { type: "reference", class: "reference.law.lbo_bw", name: "§34 LBO BW" },
);
client.graph.nodes.update({ type: "org", orgId }, nodeId, { phase: "design" });
client.graph.nodes.delete({ type: "org", orgId }, nodeId);

client.graph.edges.create(
  { type: "project", projectId },
  { sourceId, targetId, type: "hasRequirement" },
);

// Several ops in one transaction: the shape the single-op sugar compiles into.
client.graph.apply({
  scope: { type: "project", projectId },
  nodes: [{ op: "create", type: "object", class: "element.door", name: "D-01" }],
  edges: [{ op: "create", sourceId, targetId, type: "bounds" }],
});

client.graph.vocabulary.nodeTypes.canonical;
client.graph.vocabulary.edgeTypes.descriptions;
```

`GraphNodeClient` and `GraphEdgeClient` each expose `list`, `findById`,
`create`, `upsert`, `update` and `delete`. No `*ForOrg` / `*ForProject`
suffixes: the scope is the first argument, and the client turns it into the
collection path. Every write except `findById` is sugar over
`client.graph.apply`, so a single mutation and a bulk import take the same code
path and the same transaction.

## React hooks shape

```tsx
const scope = { type: "project", projectId };

const { data } = useGraphNodes(scope, { type: "object" });
const { data } = useGraphNode(nodeId);

const create = useCreateGraphNode();
create.mutate({
  scope,
  input: { type: "reference", class: "reference.norm.din_18022", name: "DIN 18022" },
});

const update = useUpdateGraphNode();
update.mutate({ scope, nodeId, input: { phase: "construction" } });

const remove = useDeleteGraphNode();
remove.mutate({ scope, nodeId });

const vocab = useGraphVocabulary();
```

Every mutation takes the scope, because every mutation is a changeset posted to
a collection. Three files: `graph.node.hooks.ts`, `graph.edge.hooks.ts`,
`graph.hooks.ts`; the last holds `useApplyGraph` (the whole changeset), the
static vocabulary accessor, and is where a future `useGraphQuery` lands.

`platformKeys.graph.nodes.list(scope)` keys list queries by scope; detail queries
key on the globally-unique node id alone
(`platformKeys.graph.nodes.detail(nodeId)`). Mutations whose post-state straddles
scopes (update, delete) invalidate every cached list via
`platformKeys.graph.nodes.lists()` plus the affected detail.

## Migrations

The slice owns its own chain in `packages/graph-api/drizzle/`, journaled
separately from every other slice:

```
0000_graph.sql          graph_node, graph_edge, graph_version, content_hash
0001_group_id.sql       the owning group on every row
0002_actor_subject.sql  who changed it
0003_actor_user_id.sql  ...keyed on the platform's user.id, not the identity subject
0004_actor_id.sql
```

The migration does not install a `node_type_chk` CHECK constraint: vocabulary
discipline is at the API layer, not the DB. A composite UNIQUE on
`project(id, orgId)` is installed by `006_node` as a prerequisite for the
composite FK on `graph_node(project_id, org_id)`.

## Why this shape (research-backed)

A deep-research pass (June 2026; adversarially verified claims) settled the
contested decisions:

- **Append-only versioning on the relational SoR** is the production pattern for
  versioned AEC models. Speckle, the closest precedent, stores objects immutable
  and content-addressed ("if they change, they get a new hash") with cross-version
  dedup by content hash; our `content_hash` column mirrors that idea
  (skip-if-unchanged now, dedup/diff later).
- **In-graph versioning has no living prior art.** The only citable
  implementation (Neo4j Versioner Core, an Entity/State split) is unmaintained
  since 2021, and its as-of-date read claims failed verification. Bitemporal
  properties in the graph would tax every query forever. Hence: versions in
  Postgres, graph DB current-state-only, re-projection for time travel.
- **Validation prior art** (for the future validator, not shipped): peer-reviewed
  comparisons rank SHACL the most capable declarative approach but document
  exactly the coupling LOCUS avoids. Steal SHACL's severity vocabulary and its
  false-compliance discipline — data-presence preconditions so missing data
  yields `skip`, never a silent `pass`. The EU digital-permit projects ACCORD +
  CHEK independently converged on rules-as-data + domain-partitioned evaluator
  services, which is LOCUS's requirement-node + `eval: external` design.
- **Agents**: LLM-generated rule-check code peaked at ~77% in benchmarks;
  text-to-Cypher tops out around 60–62% execution accuracy (CypherBench, ACL
  2025). So: LLMs formalize (with human review states), the operator catalog
  evaluates, and agents get typed MCP tools, never raw Cypher.

## SLO targets and measured values

From `pnpm -C apps/api graph:smoke` (2026-08-20, local Memgraph, 11-node model
across two projects):

| Metric                            | Target (v1)                       | Measured                                 |
| --------------------------------- | --------------------------------- | ---------------------------------------- |
| Sync lag (commit → graph visible) | p99 < 5s                          | 582ms (floor is the 500ms tick)          |
| Delete convergence                | p99 < 5s                          | 529ms                                    |
| Egress query                      | p99 < 200ms for 10k-node projects | 2ms (6-node model; re-measure at scale)  |
| Connectivity query                | p99 < 500ms per project           | 1ms (6-node model; re-measure at scale)  |
| Replay-from-zero                  | < 60s per 100k version rows       | not yet measured (needs a bulk import)   |

The smoke lives in `apps/api/scripts/graph.smoke.ts`, because the app that binds
the modules and the harness that seeds tenancy both live there. Memgraph comes up
with `pnpm -C packages/graph-api db:graph:up`, which owns the compose file.

## Not built

- Per-block patch endpoint + named checkpoints/commits (LOCUS §4.4 granular
  mutation; the version log already records full post-state snapshots).
- Retention/compaction policy for `graph_version` (anchored on the
  commit/checkpoint concept; includes the governance question of how "version X
  audits" compose).
- Typed traversal routes `/graph/paths`, `/graph/validate` (egress, connectivity)
  as a typed route.
- Validator v1 (operator catalog, pass/fail/skip with data-presence skip
  discipline, severity).
- LLM document-formalization pipeline (reference nodes → draft requirement nodes
  with human review states).
- Memgraph service container in CI for the gated projection e2e.
- `locus-validator` integration.
- Override mechanism for requirements (LOCUS §4.6 Abb. 18).
- Public/system node tier; per-org canonical vocabulary extensions.
- Realtime collab / vector search / write-back from the graph DB: non-goals.

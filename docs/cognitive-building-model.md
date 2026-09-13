# Cognitive Building Model

The model layer: what the nodes mean. [`graph.md`](graph.md) is the engine layer
(Postgres source of truth, the version log, the graph-DB projection, the REST
surface, permissions, migrations) and stays authoritative for all of it. This doc
is authoritative for the vocabulary, the node types, the block and edge
conventions, the rule and verdict shapes, and the roots.

A BIM file records geometry. A cognitive building model records what the building
**is**, what it **must satisfy**, what it **actually does**, and **why we believe
each of those**, as one versioned graph that emits every change as an event.

## Status

| Layer                                       | State                                                        |
| ------------------------------------------- | ------------------------------------------------------------ |
| Fabric: objects, blocks, versioning, sync    | Ships. See [`graph.md`](graph.md).                           |
| Sources: citable units of external documents | Class root and edges ship; the blocks do not.                |
| Rules: machine-evaluable normative statements | Node type, class root and `governs` ship; blocks do not.    |
| Verdicts: evidence with deviation            | Specified here. Not built.                                   |
| Change spine, collaboration                 | Specified here. The version log it builds on ships.          |

**Rename applied.** The platform ships `object | rule | source`. Zero DB columns
changed: the values live in a text column, so there was no migration. Sibling
repos (`cbm-demo`, `locus-*`) consume the published contracts and need the same
pass.

| Old              | New       | Why                                                                                          |
| ---------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `requirement`    | `rule`    | A permission or an entitlement is not a requirement. LBO BW §56 deviations *sind zuzulassen*.   |
| `reference`      | `source`  | A §-Absatz is not a reference to something; it is the thing being referenced.                   |
| `hasRequirement` | `governs` | Named from the actor, source to target, like `bounds` and `serves`. Not a `has*` noun.          |

## The five layers

Layers are a vocabulary, not five databases. L1, L2 and L3 are rows in the same
`graph_node` table under the same tenancy and permissions; L4 is its own table
projected into the graph; L5 is a block plus an external series store.

| Layer            | Holds                                                        | Node type       |
| ---------------- | ------------------------------------------------------------ | --------------- |
| L1 Fabric        | Spaces, elements, systems, topology                          | `object`        |
| L2 Knowledge     | Citable units of laws, norms, specs, briefs, drawings        | `source`        |
| L3 Normative     | Machine-evaluable rules bound by selector                    | `rule`          |
| L4 Evidence      | Verdicts: status, measured value, deviation, inputs          | rows + mirror   |
| L5 Operations    | Sensor bindings and rolling aggregates                       | `operations` block |

The test for "cognitive": a descriptive model answers "how big is the kitchen". A
cognitive model answers "is this kitchen allowed, under which paragraph, by how
much does it miss, what changed to make it miss, and what else did that change
break". Each is a query once L3 and L4 exist.

## Identity core

Six immutable fields, identical for every node type. **The core is closed**: no
type-specific field is ever added to it, and nothing in it is restated inside a
block. Every type-specific dimension goes into `class` or a block.

| Field      | `object`                                    | `rule`                     | `source`                          |
| ---------- | ------------------------------------------- | -------------------------- | --------------------------------- |
| `id`       | uuid, stable                                | same                       | same                              |
| `type`     | `object`                                    | `rule`                     | `source`                          |
| `class`    | kind + spatial position, `space.circulation`    | domain, `rule.code.clearHeight` | genre, `source.law`          |
| `name`     | display name                                | rule title                 | the citation, `§ 34 (1) Nr. 2 LBO BW` |
| `version`  | server-assigned counter                     | same                       | same                              |
| `parentId` | spatial containment                         | **null**                   | document structure                |

Two deviations, both deliberate:

- **`class` carries a different axis per type.** That is the purpose of the field:
  it is the per-type taxonomy slot, exactly as `type` is the discriminator slot.
- **`parentId` is null for rules.** A rule has no tree of its own. What looks like
  one is the source it derives from, which `provenance.sourceId` already records.
  Overloading `parentId` to mean "derives from" for one type while it means
  "contained in" for the other two puts one fact in two places. **There is no
  rule-set node.**

### What is actually immutable

`graph.md` calls the identity core "immutable after creation". That is not what the
code does, and it should not be: only `id`, `type` and `version` are truly fixed.

**`parentId` must be mutable.** Re-parenting is a real operation: a model correction
moves a room to the right storey, federation matching fixes a wrong assignment, a
node detaches to org scope. The alternative is delete-and-recreate, which destroys
the id and with it the claim history, the verdicts and every asserted edge pointing
at the node. Stable identity across imports is the point of the whole model, and the
federation section leans on re-parenting explicitly as the mitigation for the first
import defining the spine.

**`class` should be mutable in its leaf and immutable in its root**, which is
neither what the doc claims nor what the code enforces:

| Change                      | Allowed | Why                                                                                     |
| --------------------------- | ------- | --------------------------------------------------------------------------------------- |
| `space` → `space.sanitary`  | yes     | Taxonomy refinement. Same type, same block set, same edges. The common case: correcting what an importer guessed. |
| `space.office` → `space.treatment` | yes | Refinement within a root.                                                          |
| `space` → `element.wall`    | **no**  | The root determines `type` via `nodeTypeFromClass`, so this changes which blocks are valid, which edges may attach and which rules bind. It is a different entity wearing an existing id. |

Enforced by `assertClassRootStable` on both write paths (the `update` op and an
`upsert` onto an existing row, which rewrites `class` the same way), rejecting with
`GRAPH_NODE_CLASS_ROOT_IMMUTABLE` (409). Before that guard a root change succeeded
silently: the root was only passed to the drift classifier, so the node's derived
`type` moved under it and every selector filtering on class rebound unasked.

**A dot in `class` means "is a kind of", never "is a part of".**
`element.wall.curtain` is a wall and a query for the family finds it. A part is
a relationship and belongs to the mereological edge family below, not to a class
leaf: written as `element.stair.flight` it would make a query for stairs count
every flight as another stair. Compound nouns stay camelCase
(`element.stairFlight`, `element.shadingDevice`).

**Use lives in `programme.use`, never in the class leaf.** It was expressible twice,
as a class leaf (`space.circulation`) and as a programme field, which is what made the
mutability question murky: if use is in the class, then a Nutzungsänderung is a
re-classification, and a Nutzungsänderung is one of the most heavily regulated events
in the corpus. Split by lifetime instead. `class` is the durable typological kind
that survives a change of use (`space.circulation`); `programme.use` is the current
use (`teaKitchen`, `treatment`). A change of use is then an ordinary property write,
and the class-root rule never has to arbitrate it. Selectors read either, so nothing
is lost: `where: [{ path: "programme.use", operator: "eq", value: "teaKitchen" }]`.

`programme` also carries `activities` (plural, an array) for what happens in a space,
which is a different question from what its use is.

### There is no `phase` field

`phase` is dropped from the core by this spec. It still exists in the wire schema and
the `graph_node` column, so removing it is a pending change; nothing new should use
it. The model moves by phase, not the node.

- The design-versus-as-built dimension lives on **claims** (see below), so a
  node-level `phase` was a second home for the same fact.
- `draft`, `inForce`, `submitted` are review and legal **status**, not project
  phases. They live in a `lifecycle` block.
- Which phase to **read** is a property of the evaluation, so it joins the intent
  in the evaluation context as `readPhase`.

## Blocks

`properties` is a jsonb bag whose top-level keys are capability blocks. One
convention for all three types:

1. A block key is a lowercase singular domain noun.
2. Variants inside a block discriminate on `type`.
3. Arrays are plural.
4. Booleans take `is` / `has` / `can`.
5. No abbreviations (`options`, not `opts`).
6. Nothing in the six-field identity core is restated inside a block.

| Type     | `class`                                                                     | Blocks                                                                                            |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `object` | `site` `building` `storey` `space` `element.*` `interface` `project` `import` `procedure.*` | `envelope` `programme` `material` `finishes` `systems` `geometry` `interop` `operations` `compliance`\* `provenance` |
| `rule`   | `rule.code.*` `rule.norm.*` `rule.project.*` `rule.modifier.*`              | `selector` `criterion` `enforcement` `lifecycle` `provenance`                                      |
| `source` | `source.law` `source.norm` `source.spec` `source.brief` `source.drawing` `source.datasheet` `source.correspondence` | `citation` `lifecycle` `publication`\*\* `provenance` |

\* derived, mirrored from verdict rows. \*\* on the root unit only, resolved one hop up.

`provenance` is universal. `lifecycle` is near-universal and holds
`{ status, since }` with a per-class vocabulary: `draft | inReview | active | superseded`
for a rule, `inForce | superseded | repealed` for a source,
`submitted | decided | withdrawn` for a procedure. One slot, one filter
(`?properties->lifecycle->status=eq.active`) across every type.

**Blocks are the type system.** `type` is derived from the first segment of
`class` and is not validated against it, so it carries no information a reader
could not compute; what distinguishes a space from a rule is which blocks it
carries. Never add a fourth node type. A verdict is a row, a document section is a
`source`, a rule set does not exist. New capability arrives as a new block.

## Edges

An edge is a block with two endpoints. `defineEdge` is the exact twin of
`defineBlock`: a key, a description, a zod schema for its own properties, plus
relation metadata.

```ts
defineEdge({
  type: "connectsTo",
  description: "Passable connection between two spaces.",
  from: ["space"],
  to: ["space"],
  cardinality: "manyToMany",
  symmetric: true,
  transitive: false,
  origin: { kind: "derived", producer: "adapter.topology.portal" },
  schema: z
    .object({
      viaElementId: z.string().optional(),
      clearWidthM: z.number().min(0).optional(),
      isFireRated: z.boolean().optional(),
    })
    .passthrough(),
});
```

| Field         | Controls                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| `from` / `to` | Allowed endpoint class patterns. A violation is counted as drift and logged, never rejected.                     |
| `cardinality` | `oneToMany` means the target may have at most one incoming edge of this type; `manyToOne` constrains the source's outgoing. One rule covers both exclusivity cases. |
| `symmetric`   | Whether direction carries meaning. Storage and query below.                                                     |
| `transitive`  | Whether the relation composes. Only transitive types get a variable-length pattern.                             |
| `origin`      | `asserted` or `derived` with a named producer, so derived edges are wipeable and the producer says what to re-run. |

### All edges behave the same, because symmetry is declared not stored

- **Storage is uniform**: always one directed row in `graph_edge`. No second row
  for a symmetric relation, no special table.
- **Symmetric writes are canonicalised** so `sourceId < targetId`. That makes
  `adjacentTo(a,b)` and `adjacentTo(b,a)` the same row, so the content hash is
  stable and topology re-derivation stays idempotent under skip-if-unchanged.
- **Queries read the flags**: the Cypher builder emits `-[:ADJACENT_TO]-` for a
  symmetric type, `-[:BOUNDS]->` for a directed one, and `-[:CONTAINS*]->` only
  where `transitive`. Memgraph and Neo4j both match undirected patterns and
  variable-length paths natively.

| Edge          | From → to                        | Cardinality  | Sym | Trans | Origin              |
| ------------- | -------------------------------- | ------------ | --- | ----- | ------------------- |
| `contains`    | zone → zone, element, interface  | `oneToMany`  | no  | yes   | derived (`parentId`) |
| `bounds`      | `element.*` → space              | `manyToMany` | no  | no    | derived             |
| `adjacentTo`  | space → space                    | `manyToMany` | yes | no    | derived             |
| `connectsTo`  | space → space                    | `manyToMany` | no  | no    | derived, two arcs   |
| `hostedIn`    | `element.*` → `element.*`        | `manyToOne`  | no  | no    | imported            |
| `interfaceOf` | interface → space, element       | `manyToMany` | no  | no    | derived             |
| `serves`      | `element.system` → space         | `manyToMany` | no  | no    | imported            |
| `governs`     | rule → object                    | `manyToMany` | no  | no    | **asserted only**   |
| `modifies`    | rule → rule                      | `manyToMany` | no  | no    | asserted            |
| `cites`       | source → source                  | `manyToMany` | no  | no    | asserted            |
| `amends`      | source → source                  | `manyToOne`  | no  | chain | asserted            |
| `supersedes`  | source → source                  | `manyToOne`  | no  | chain | asserted            |
| `includes`    | source → source                  | `oneToMany`  | no  | yes   | derived (`parentId`) |

### Naming: three families, one rule each

An edge type is always a verb phrase read from source to target, and never a
`has*` noun. Which end is the source is decided by the family:

| Family                    | Source is                          | Edges                                        |
| ------------------------- | ---------------------------------- | -------------------------------------------- |
| **Mereological** (part of) | the part, not the whole            | `hostedIn`, `interfaceOf`, and the two containment edges\* |
| **Functional** (X acts on Y) | the actor                        | `bounds`, `serves`, `governs`, `cites`, `amends`, `supersedes` |
| **Topological** (symmetric) | neither; the name reads both ways | `adjacentTo`, `connectsTo`                    |

Values are camelCase with no abbreviations, matching the enum convention in
`AGENTS.md`: `manyToMany`, not `many-to-many` (kebab is reserved for file names)
and not `m-to-n` (an abbreviation).

\* **The containment pair is the one violation.** `contains` and `includes` are
mereological but named from the whole, so they point parent → child while
`hostedIn` points child → parent, and they invert the direction of the fact they
mirror: `parentId` lives on the *child*, yet the projection writes the arc from
the parent. Renaming to `containedIn` / `partOf` would make the family consistent
and align each edge with its foreign key. The cost is that `contains` is the
near-universal name in the domain (IFC, BOT, most BIM tooling), so this is
internal consistency against external familiarity. Left as-is, deliberately, and
recorded here rather than silently tolerated.

**Why two names for one column.** `parentId` is on every node type, but the tree
it builds is not one relation: a storey contains a space in physical space, an act
includes a § by composition, and no query means both at once. One name would force
every spatial traversal to carry a class filter to stay out of the documents, and
`graph.dialect.ts` walks `CONTAINS|ADJACENT_TO|BOUNDS` with no such filter. The
projection picks the arc from the child's class root (`containmentEdgeFor`), so a
third tree needs a definition and no code.

### Why both `adjacentTo` and `connectsTo`

They are independent, not redundant. `adjacentTo` is a shared boundary, which may
be a solid wall. `connectsTo` is passable: a door, an unfilled opening, an
open-plan virtual boundary. Two rooms can be adjacent and not connected (a wall),
and two spaces can be connected without sharing a boundary (linked by a stair
across storeys). Egress and reachability walk `connectsTo`; fire compartmentation,
acoustics and thermal questions walk `adjacentTo`.

`adjacentTo` is symmetric and `connectsTo` is not, which looks inconsistent and is
not. Adjacency is mutual and nothing routes over it. Passability is *not* always
mutual: panic hardware, turnstiles and security doors are traversable one way, and
direction is the only mechanism a path algorithm respects natively. It has to be:
`*wShortest` has no relationship filter, which is why impassability already needs a
prohibitive weight rather than a predicate, and a weight lambda receives the edge
rather than the direction of travel, so one-way passability cannot be encoded as a
property at all. So `connectsTo` is directed and an ordinary two-way passage is
written as two arcs. That costs one extra row per doorway and buys a correctness
property no property filter can provide.

Collapsing them into one edge with a `passable` property would be worse than
verbose: reachability is a variable-length traversal (`-[:CONNECTS_TO*]-`), and a
property filter inside one is materially slower in both engines than a
relationship-type filter, which is resolved from the adjacency list. The
distinction earns its place because it is on a hot path.

### Direction: eleven directed, one symmetric

Storage is never a choice: property graphs have no undirected relationship, so
every edge has a start and an end node. What *is* a choice is whether the direction
carries meaning, and the test is one question: **swap the endpoints, is it the same
fact?** "A is adjacent to B" is. "A wall bounds a space" is not, and neither is a
rule governing an object or a revision superseding one. So eleven of the twelve are
directed and `adjacentTo` is the only symmetric one.

Direction is not a traversal decision. Traversal is free in either direction for
every edge, directed or not, so pin the direction in a pattern only when the
direction *is* the question: descendants versus ancestors, or routing where one-way
matters.

**Why not make everything directed and drop the flag.** It is tempting: no
canonicalisation branch in the writer, no branch in the query builder, no
halved-result trap to police. The reason to keep one exception is that the two cases
are not the same shape. Two `connectsTo` arcs are **two facts**, since a passage can
be one-way. Two `adjacentTo` rows would be **one fact stored twice**, because a
shared boundary cannot be one-way, so both rows would carry the same boundary
measurements and the pair would have to be maintained in lockstep forever. It would
also double the densest topology edge in the model on every re-derivation, against a
version log whose whole job is to grow with authored change.

The flag costs one boolean read in two centralised places: the writer canonicalises,
the query builder emits `-` instead of `->`. The condition to revisit is if
canonicalisation ever needs to live in more than one writer, because at that point
the rule stops being centralised and uniformity becomes worth more than the
duplication it costs.

### Direction in the graph DB

Property graphs have no undirected relationship: Neo4j and Memgraph both store a
start and an end node on every edge. That is not a constraint in practice, because
both engines index relationships on *both* endpoints, so traversing against the
stored direction costs the same as traversing with it. `MATCH (a)-[:X]-(b)` matches
either way, `-[:X]->` pins the direction, and neither is the slow one.

So storage stays uniform (one directed row per edge, always) and the semantics are
declared. Two hazards are worth naming because they are silent:

- **A directed pattern against a symmetric type returns half the answer.** Since
  symmetric writes canonicalise to `sourceId < targetId`, a hand-written
  `-[:ADJACENT_TO]->` matches only the pairs that happen to sort that way, with no
  error. The `symmetric` flag exists so the query builder emits the right pattern
  and so `POST /graph/query` can reject a directed pattern on a symmetric type
  rather than silently under-reporting. Exactly one edge type is symmetric, so this
  is one rule to enforce, not a class of bugs.
- **`contains` inverts its own foreign key**, as above: `parentId` is on the child,
  the edge runs parent to child. Nothing breaks, but every reader has to hold the
  inversion in their head.

## Claims: the write model

If `envelope.areaNet` is a field, the last writer wins and the architect's design
area is destroyed by the surveyor's measurement. If it is a **claim**, both
survive, the disagreement is visible, and the resolved value is a policy rather
than an accident of write order.

Assertions have nothing to do with rules. Rules are ordinary nodes, as you would
expect; a claim is about **two sources disagreeing over one field on one node**, which
is the multi-contractor problem: the architectural model says the storey sits at
7.15 m, the MEP model says 7.18 m, and a surveyor later says something else again.
Last-writer-wins destroys whichever arrived first, silently, and destroys a hand edit
on the next re-import.

They earn a second job under the revision above: being the history at path
granularity, so the version log needs no payload.

There is a cheaper eighty per cent, worth knowing before committing to the full
model: a `lockedPaths` set on the node, meaning "a human set this, do not overwrite on
import". That covers the hand-edit case alone. It does not give phase-scoped reads,
confidence, provenance per value, queryable conflicts, or programme-versus-built as a
diff. If those are not required, locked paths is a tenth of the work.

`node_assertion` is append-only, one row per claim about one path:
`(nodeId, path, value, phase, source, method, confidence, seq)`. The `properties`
bag becomes a **resolved projection** of it, so every existing reader, filter and
Cypher query is untouched. Assertions are the sacred data; the bag is derived.

Resolution is deterministic and **phase-scoped**: a read names the phase it wants
and falls back down `asBuilt → design → brief`.

| Rank | Rule                                                | Why                                                                                       |
| ---- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1    | Human confirmation beats any automatic source        | A reviewer who has stood in the room outranks a parser.                                   |
| 2    | A read is phase-scoped, with fallback                | Nothing is overwritten, so programme-versus-built is a diff rather than a data migration.  |
| 3    | Measured beats modelled beats inferred               | A survey outranks an IFC quantity, which outranks a guess.                                |
| 4    | Higher confidence beats lower                        | Below threshold resolves but is marked unconfirmed and cannot satisfy a mandatory precondition alone. |
| 5    | Later sequence beats earlier                         | The tie-break, and the only rule most systems have.                                       |

A conflict is queryable: same path, same phase, different value.

## Rules

```jsonc
{
  "id": "rule-lbobw-5-7-s1-setbackDepth",
  "type": "rule",
  "class": "rule.code.setbackDepth",
  "name": "§ 5 (7) Satz 1 Tiefe der Abstandsflächen",
  "parentId": null,
  "version": "3",
  "properties": {
    "selector": {
      "classes": ["element.wall"],
      "where": [{ "path": "programme.isExternalWall", "operator": "eq", "value": true }],
      "intents": ["newBuild", "extension", "storeyAddition"],
      "unless": [
        [
          { "path": "intent.type", "operator": "eq", "value": "storeyAddition" },
          { "path": "intent.storeysAdded", "operator": "lte", "value": 2 },
          { "path": "intent.existingPermit.ageYears", "operator": "gte", "value": 5 }
        ]
      ],
      "jurisdictions": ["DE-BW"]
    },
    "criterion": {
      "measure": {
        "type": "analysis",
        "analysis": "setback",
        "field": "depthProvidedM",
        "measurand": "lbobw.setbackDepth",
        "unit": "m"
      },
      "cases": [
        {
          "nummer": "2",
          "order": 1,
          "when": [{ "path": "project.landUseCategory", "operator": "in", "value": ["kerngebiet", "dorfgebiet"] }],
          "constraints": [{ "operator": "gte", "ref": { "path": "envelope.wallHeight" }, "factor": 0.2 }],
          "quote": "in Kerngebieten, Dorfgebieten … 0,2 der Wandhöhe"
        },
        {
          "nummer": "1",
          "order": 3,
          "when": [],
          "constraints": [{ "operator": "gte", "ref": { "path": "envelope.wallHeight" }, "factor": 0.4 }],
          "quote": "allgemein 0,4 der Wandhöhe"
        }
      ],
      "onNoCase": "skip"
    },
    "enforcement": {
      "severity": "mandatory",
      "authority": "untere Baurechtsbehörde",
      "canDeviate": true,
      "deviationBasis": "§ 56 (2)"
    },
    "lifecycle": { "status": "active", "since": "2026-07-30" },
    "provenance": {
      "sourceId": "src-lbobw-5-7",
      "quote": "Die Tiefe der Abstandsflächen beträgt …",
      "instrument": "LBO BW",
      "article": "§ 5 (7) Satz 1",
      "revision": "2023",
      "method": "llm",
      "confidence": 0.91,
      "reviewedBy": "u-mb",
      "reviewedAt": "2026-07-30"
    }
  }
}
```

### Measure variants

`criterion.measure` is a discriminated union on `type`. The variant decides both
which evaluator runs and which dependency key the verdict records.

| `type`       | Shape                                                                       | Dependency key                     |
| ------------ | --------------------------------------------------------------------------- | ---------------------------------- |
| `path`       | `{ path, unit, measurand? }`                                                | field, `node:X#envelope.clearHeight` |
| `expression` | `{ expression: "a / b" }`                                                   | field, one per operand             |
| `relation`   | `{ edgeType, targetClass, aggregate: "count" }`                             | relation, `node:X#edges:contains`  |
| `analysis`   | `{ analysis, field, options, unit }`                                        | region, `storey:Y#topology`         |
| `aggregate`  | `{ over, path, aggregate }`                                                 | subtree, `node:X#subtree`           |
| `judgement`  | `{ prompt, evidence[], expiresOn }`                                         | none, expires on source revision   |

`judgement` matters more than it looks. A compliance product that silently drops
what it cannot compute is worse than one with no rules, because the clean report
reads as approval. It keeps the rule in the graph, in the coverage count, and in
somebody's queue.

### One operator vocabulary

The same names serve list filters, selector predicates and constraints:
`gte` `gt` `lte` `lt` `eq` `neq` `in` `notIn` `contains` `startsWith` `endsWith`
`match` `exists` `notExists`.

A range is two constraints. A minimum count is a `relation` measure plus `gte`.
Deviation direction falls out of the operator: for `gte`, below is a shortfall;
for `lte`, above is an exceedance. An unknown operator is accepted, counted as
drift, and evaluates to `error`, never `pass`.

### Cases, referenced bounds, intents

Three constructs, measured to take LBO BW expressiveness from 42 to 72 per cent
of its quantitative rules.

**`criterion.cases`** is an ordered list; the first whose `when` holds supplies the
constraints. Each case keeps its statutory `nummer` for the citation and a separate
`order` for evaluation, because **statutory order is not evaluation order**: in
§ 5 (7) Nummer 1 is the residual, and a naive first-match over the statute's own
numbering gives every plot in a Kerngebiet 0,4 instead of 0,2 and passes a setback
it should fail.

A constraint inside a case may carry its own `when` and go inactive, for
independent dimensions that would otherwise multiply the case list.

**`constraints[].ref`** makes the bound a measure:
`value = ref × factor + offset`, factor default 1, offset default 0. `ref` must
resolve to the measure's unit after both, checked at contract time.

**`selector.intents` and `selector.unless`** add the second evaluation input: the
action being taken. The intent is not a flag on the changeset; it is a
`procedure.*` node, because a verdict must be reproducible and one application
affects many nodes. `where` stays a pure conjunction; `unless` is a list of groups
where any match means not-applicable, which is the shape statutory exemptions
take.

### Path scopes

One grammar, used identically in `where`, `measure` and `ref`. Resolution is
lexical and closed: six prefixes, no expressions, at most one edge hop.

```
envelope.areaNet                       the subject node
parent.envelope.areaNet                the hierarchical parent
storey.compliance.status               nearest ancestor of that class
project.landUseCategory                the project anchor node
intent.storeysAdded                    the evaluation context
@bounds[element.wall].envelope.height  across one edge, needs an aggregate
```

### Validation rules

1. Exactly one of `constraints` or `cases` on a criterion.
2. At most one open case (`when: []`), and it must carry the highest `order`.
3. `nummer` is provenance, `order` is evaluation. Never assume they agree.
4. No case matched and no open case means `skip`, never `pass`.
5. Every constraint in the applied case inactive means `skip`, never `pass`.
6. `ref` must resolve to the measure's unit after `factor` and `offset`.
7. Cases vary the bound, never the measurand. A different measurand is a different rule.
8. No nested cases, no disjunction inside `where` (add a case), no arithmetic
   beyond `factor` and `offset` (name an analysis).

Rules 4, 5 and 8 are load-bearing. The first two stop the extension inventing a
way to pass by accident, which is the only failure mode worse than not covering a
rule. The last is the wall against this becoming a language: every request for
more expressiveness is answered with a named, versioned, tested analysis.

### Deferred expressiveness gaps

Measured against LBO BW (see Coverage below), with the count of rules each blocks.

| Gap                             | Blocks | Extension                                                             |
| ------------------------------- | ------ | --------------------------------------------------------------------- |
| G3 quantified over relations    | 5      | `criterion.over: { edgeType, targetClass, quantifier: "all"｜"any" }`   |
| G6 alternatives and compensation | 5     | `criterion.anyOf: [...]`, `criterion.compensatedBy: [...]`            |
| G5 measure over part of a node  | 4      | `measure: { type: "region", of, where, as }`                          |
| G4 aggregate over a subset      | 3      | `measure: { type: "aggregate", over, aggregate, path }`               |
| G9 ordered non-numeric scales   | 3      | vocabulary `scale: { id, order: [...] }`, resolved by `gte`           |
| G11 granted deviations          | 2      | a deviation row → verdict status `permitted`, with grantor and conditions |
| G12 threshold owned elsewhere   | 1      | `constraints: [{ operator, valueFrom: { sourceId, key } }]`           |
| G8 rules that classify          | 4 indirect | `criterion.assigns: { path, value }`, evaluated before compliance |
| G10 measurand, not just a path  | 6 **silent** | `measure: { path, method, projection?, tolerance? }`            |

G10 is the worst failure mode in this spec. Six LBO BW rules formalise into valid
criteria that read the wrong quantity: § 34 (2) demands the **Rohbaumaß** of the
window openings reach a tenth of the floor area, and the structural opening is
materially larger than the clear glazed area a model carries. The engine returns
`pass` with full provenance and is wrong. Every other gap leaves a visible hole;
this one produces confident nonsense. A measure must name its measurement method.

## Verdicts

A row per `(scenarioId, contextId, ruleId, nodeId)`, with `main` and `null` as the
defaults.

```jsonc
{
  "status": "fail",              // pass | fail | skip | review | error | permitted | stale
  "caseNummer": "1",
  "caseReason": "no more specific case matched",
  "appliedBecause": { "unlessGroupsEvaluated": 1, "matched": 0 },
  "actual": 3.10,
  "expected": 3.42,
  "expectedFrom": { "ref": "envelope.wallHeight", "refValue": 8.55, "factor": 0.4, "resolved": 3.42 },
  "deviation": -0.094,
  "unit": "m",
  "inputs": [{ "path": "envelope.wallHeight", "value": 8.55, "nodeVersion": 12 }],
  "ruleVersion": 3,
  "evaluatorVersion": "analysis:setback@1.4.0",
  "computedFromSeq": 90412
}
```

- **Rows, not nodes.** Volume tracks rules times nodes and churns on every edit,
  so it must stay out of the version log.
- **The row is the binding.** It carries both ids plus a status an edge cannot
  hold, so a selector binding creates no edge. `governs` survives only for
  asserted human attachment. That saves roughly 60k edges per storey-set.
- **Read path**: a four-field `compliance` summary
  (`{ status, failures, worstDeviation, computedFromSeq }`) is mirrored onto the
  object node and into the projection, so a viewer draws markers from one node
  read and never joins.
- **Staleness is displayed, not hidden.** `computedFromSeq` behind the log head
  for any dependency renders as stale with the last known value.

Normalise the definition, denormalise the answer.

## Sources and extraction

### The document tree

Depth is `parentId`, the same identity field the spatial tree uses, so a document
needs no mechanism of its own:

```
src-lbobw                    act          LBO BW
└─ src-lbobw-teil-6          part         Teil 6
   └─ src-lbobw-34           paragraph    § 34
      └─ src-lbobw-34-1      subsection   § 34 (1)
         └─ src-lbobw-34-1-2 item         § 34 (1) Nr. 2
```

`citation.level` names the rung, `citation.ordinal` orders siblings, and
`citation.path` (`["34","1","2"]`) is the address that joins `extraction_unit`.
Because `parentId` mirrors into the projection as `includes` for sources, the
document tree is traversable in Cypher for free: `-[:INCLUDES*]->` from the act
reaches every unit, and a spatial walk over `CONTAINS` cannot stray into it.

Depth is unbounded and self-similar, which is exactly why the level is not in
`class`: a paragraph and a sentence are the same kind of thing at different
granularity, carrying the same blocks and behaving the same way. BauGB segments
into seven rungs (act, Kapitel, Teil, Abschnitt, §, Absatz, Nummer); an ISO
standard has three; a spreadsheet brief has workbook, sheet, cell. One tree, one
open level vocabulary.

A source node is a **spine**: the logical address of a citable unit. Nothing
extracted, because re-parsing is the most frequent operation in the pipeline and
must write zero graph rows.

```jsonc
{
  "id": "src-lbobw-34-1-2",
  "type": "source",
  "class": "source.law",
  "name": "§ 34 (1) Nr. 2 LBO BW",
  "parentId": "src-lbobw-34-1",
  "version": "2",
  "properties": {
    "citation": { "fileId": "f-lbo-bw-2023", "level": "item", "ordinal": "2", "path": ["34", "1", "2"] },
    "lifecycle": { "status": "inForce", "since": "2023-08-01" }
  }
}
```

Three independent axes, three cheap filters:

| Axis   | Answers                              | Lives in            | Filter                                          |
| ------ | ------------------------------------ | ------------------- | ----------------------------------------------- |
| genre  | what kind of source, what authority  | `class`             | `?class=eq.source.law`                          |
| format | how the bytes are organised          | `anchor.format`     | `?properties->anchor->format=eq.spreadsheet`    |
| level  | depth in the document's own structure | `citation.level`    | `?properties->citation->level=eq.paragraph`     |

`level` is an open string with a canonical set suggested per genre and format
(`act` `part` `chapter` `section` `paragraph` `subsection` `sentence` `item` for a
law; `workbook` `sheet` `cell` for a spreadsheet-formatted brief), drift counted
when something novel appears. There is no rigid matrix: `level` follows genre for
statutes and format for a brief.

Owned by `files-api`, because it already owns bytes and should own parsing;
`graph-api` never touches a PDF:

```
extraction        id, file_id, extractor, version, started_at, unit_count
extraction_unit   extraction_id, logical_path, level, ordinal, label,
                  text, text_sha, page, char_range, bbox, embedding
```

Join key is `(fileId, path)`, which is what the node carries. Drift detection is a
`text_sha` comparison between two extraction versions for one `logical_path`,
entirely inside `files-api`.

`provenance.quote` on the rule stays denormalised deliberately: it is the excerpt
a human reviewed at a point in time and must not change when the parser improves.

### Amendment flow

A revision is not an update in place. The new unit lands as a new node with its
own `inForceFrom`; the old is `superseded` and kept, because a project approved
under the old text is still governed by it. Rules derived from a superseded source
move to `lifecycle.status: "inReview"` rather than silently changing their
threshold, and every verdict that cited them goes stale. A `textSha` that no
longer matches is flagged as drifted rather than pointing confidently at the wrong
sentence.

### The pipeline, and where it is allowed to be wrong

| Stage       | Does                                                    | Failure is                                                             |
| ----------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| segment     | Split a document into a unit tree with anchors           | Recoverable, and it **fails silently**, so reconcile against a second source of truth (the document's own table of contents) and refuse to report until they agree. |
| formalise   | An LLM proposes rule blocks with the quote and a confidence | Expected. Benchmarks put LLM rule generation near three quarters correct, so a draft is a hypothesis. |
| review      | A person accepts, edits, or rejects, with reasons kept   | The gate. Nothing mandatory evaluates from an unreviewed rule.          |
| bind        | Evaluate selectors, write a verdict row per match        | Visible. Rules binding to nothing and classes nothing guards both show as gaps. |
| evaluate    | Run the operator catalogue or a named analysis           | Deterministic. Same inputs, same rule version, same verdict, forever.   |

## Roots, imports, federation

**One anchor per project**: `class: "project"`, `id` equal to the `projectId`,
`parentId: null`, created lazily on the first graph write so `directory` never has
to know the graph exists. It is the only node with a borrowed identity, which is
what stops the two drifting. It holds project-level modelling facts as claims
(`landUseCategory`, jurisdiction, datum), which is what `project.*` path scopes
resolve against.

Hangs off it: spatial roots (`site → building → storey → space`), project-scoped
source roots, import records, procedures. Does not: rules (`parentId` null,
grouped by `provenance.sourceId`) and org-scoped library sources (LBO BW is
org-scoped with `parentId: null`; the existing hydration rule already makes the
org library visible from a project read). An org anchor node is deferred until
something needs to hang off one.

**An import is a record, not a root.** The IFC file's own `IfcProject` and
`IfcSite` do not become nodes.

```jsonc
{
  "id": "imp-arch-r9",
  "type": "object",
  "class": "import",
  "name": "Architektur r9",
  "parentId": "proj-hofstr-12",
  "properties": {
    "interop": { "format": "ifc4", "fileId": "f-arch-r9", "units": "metre", "crs": "EPSG:25832" },
    "lifecycle": { "status": "active", "since": "2026-07-14" },
    "provenance": { "extractor": "cbm-adapter@2.3.1", "importedBy": "u-mb", "nodesCreated": 8412 }
  }
}
```

Every node it produced carries `provenance.importId`, a **property not an edge**, for
the same reason a binding is a verdict row: 8 412 edges carrying nothing a filter
cannot give you. `supersedes` links revisions, reusing the edge type sources use.

Not `interop.importId`. `interop` answers "what is this node called in the foreign
system" (`{ format, source, sourceId, sourceClass }`, the IFC GUID and class), which
is a crosswalk. "Which upload put this row here" is provenance, and there is already
a universal block whose whole subject is how the data got here.

**Federation.** The spatial spine belongs to the project, not to any import. The
first import creates it; later imports **match** into it and contribute only their
own elements, so an MEP model attaches ducts to the existing `storey-l2` rather
than creating a second building. When two files disagree on the storey elevation,
that is two claims on one path with `conflict: true`, and the resolution policy
arbitrates while the conflict stays queryable. That yields an **information clash**
between models, a different and usually earlier signal than a geometric clash.

Matching is the risk, so it is explicit: storeys match by name then elevation
within a tolerance, every match is written as a claim with a confidence and a
producer, a human override outranks it by the standing resolution rule, and the
first import defining the spine is a real asymmetry mitigated only by the spine
being thin enough to re-parent.

**Retiring an import retracts its claims; it does not delete by `importId`.** The
difference matters the moment anyone edits by hand, which is most of the time. A wall
arrives from `arch-r9`, someone moves it, then `arch-r10` lands. Deleting every node
stamped `imp-arch-r9` would destroy the manual edit, and re-creating from the file
would silently revert it. So `importId` marks **which import created the node**, used
for layer filtering, and retirement works one level down:

- retract every claim whose `source` is the retired import
- a node with no claims left is a tombstone: delete it, and its edges cascade
- a node with a surviving claim from a person or another import stays, minus the
  retracted values, and the resolution policy re-resolves what is left

Which is the claims model doing the job it exists for: human confirmation outranks
any automatic source, so a hand edit survives a re-import and the disagreement stays
visible rather than being arbitrated by whoever uploaded last.

Nodes a person created by hand carry no `importId` at all, so they belong to no
contractor's layer. That is correct rather than a gap: they are the project's.

Folders need no graph structure: `files-api` owns the folder tree, the source node
points at the file through `citation.fileId`, and nothing in the model traverses
folders.

## Discriminating uploads, and history as a first-class surface

Worth stating before the mechanics, because an import-centric model is easy to build
by accident: **most change is editing, not re-importing.** Somebody moves a space,
edits a property, replaces an element, re-parents a room. Re-imports are the
occasional event; edits are the constant one. So the unit of change is the changeset,
and an import is simply a changeset with an unusually large body and a non-human
actor.

The pipelines table above maps each edit to the derived state it moves: a geometry
change dirties the storey's topology, a replace is a delete plus a create so the old
edges cascade and the neighbourhood is dirty, a property change either moves nothing
or rebinds one rule, and a re-parent dirties both the old and the new scope.

### Two contractors, two files, one project

Each upload is an `import` node; every node it produced carries
`provenance.importId`. So a layer toggle is a property filter, not a separate concept:

```
?properties->provenance->importId=eq.imp-mep-r3
```

If per-render filtering proves hot that is an expression index on
`(properties->'provenance'->>'importId')`, not a new column: the field is absent on
rules, on sources and on anything a person created by hand, so it does not belong
beside the identity core.

Two rules make that behave correctly rather than approximately:

- **The spine carries no `importId`.** `site`, `building` and `storey` belong to the
  project, not to whoever uploaded first: the first import *creates* them and later
  imports match into them. If the spine were stamped with the first import's id,
  hiding the architectural layer would hide the storeys. Creation is recorded in
  `provenance` as a claim; ownership is the project's, and the two are different
  facts.
- **Discipline lives on the import, not on 8 000 nodes.** The import node carries
  `discipline: "architecture" | "structure" | "mep" | "facade"`, plus its uploader.
  A discipline toggle resolves discipline → import ids → filter. Imports number in
  the tens, so a client holds the list and resolves locally; denormalising
  discipline onto every element would be a second home for one fact.

At any moment only *active* imports have nodes: retiring `arch-r9` for `arch-r10`
deletes the nodes carrying the old id and never the shared spine. So "which revision
am I looking at" is the set of active imports, and seeing a retired one is a
history question, below.

### How versioning works today

Rows, not nodes. `graph_version` is append-only, one row per changed entity per
transaction, carrying the **full post-state snapshot** as jsonb plus
`seq` (bigserial), `entityType`, `entityId`, `op`, `version`, scope, `actorId`,
`contentHash`, `createdAt`, `syncedAt`. Current state lives in `graph_node` and
`graph_edge`; the log never participates in a latest-state read.

Because snapshots are full images rather than deltas, "the model as of seq N" is one
SQL query (latest snapshot per entity where `seq <= N`) with no replay. Per-entity
history is `WHERE entity_id = X ORDER BY seq`.

### Why the snapshot should go once changesets and claims exist

A full image per changed entity per write is right when the log is the *only* record.
It stops being right the moment two other things exist, and this supersedes the
snapshot-based description above.

The waste is real: a node with a 20 KB `properties` bag edited fifty times writes a
megabyte of log for fifty small edits, and 49 of those images are nearly identical.
But size is the weak argument. The strong one is **duplication**: with a claims table,
`node_assertion` already records every value change at path granularity, with its
source and its sequence. Keeping a whole-entity image beside it is one fact in two
places, which is what this model refuses everywhere else.

| Table               | Becomes                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `graph_changeset`   | the commit.                                                                              |
| `graph_change`      | a **thin per-entity row**: `seq`, entity, `op`, `changeset_id`, `content_hash`, plus a `base` image on creates only. Renamed from `graph_version`, see below. |
| `graph_change_path` | the **history**: one row per `(entity, path)` with its new value. Gains `source`, `phase` and `confidence` when claims land. |

Three things fall out, and each removes machinery rather than adding it.

**`changedPaths` stops being computed.** The change spine was going to derive it by
diffing a snapshot pair at emit time. The writer already knows which paths it touched,
because it just wrote the assertions, so `changed_paths` is **recorded**. That deletes
the emit-time diff and a class of bugs about detecting change inside nested jsonb.

**Reconstruction stays one query, at a finer grain.** The model at a position is the
latest assertion per `(entity, path)` where `seq <= N`, re-resolved by the ordinary
policy. More rows scanned than a per-entity pick, same shape, same index pattern, and
it is the query the claims model already needs at read time. There is no fold over
operations and so no ordering hazard: an assertion is a value, not a patch.

**The projection gets more correct.** The sync worker builds Cypher from `snapshot`
today, so a worker catching up projects a sequence of *historical* images before
arriving at the present. With no payload it reads the current row by id instead, so it
can only ever project current state. At-least-once delivery becomes idempotent by
construction, and a batch can coalesce by entity id: an import that touched one node
five times projects it once rather than five times.

Identity fields become claims too. `class`, `name` and `parentId` are paths like any
other, which removes the split where the bag has history and the columns do not.

**The honest costs.** More rows, smaller rows: a 10 000 node import with twenty
populated paths writes 200 000 assertion rows instead of 10 000 snapshot rows, so
index size and insert throughput matter more while total bytes drop sharply.
Tombstones need explicit handling, because a delete is not a path change and stays an
`op` on the event row. And reconstructing one entity now touches many rows instead of
one, which is fine for a page of history and wants care for a whole-project
time-travel read.

### Naming: changeset, change, path

`graph_version` is the wrong name and the confusion is not subtle: **the table has a
`version` column**, and it is a different version. The table row is one entity's change;
the column is that entity's monotonic counter. `graph_version.version` reads as
nonsense.

Swapping the two names would be worse, since a changeset is by definition a *set* and
has to be the group. Rename the member instead, and the hierarchy becomes
self-documenting:

| Table               | Grain                                                    |
| ------------------- | -------------------------------------------------------- |
| `graph_changeset`   | one transaction. The commit.                             |
| `graph_change`      | one entity touched by it.                                 |
| `graph_change_path` | one path touched on that entity, with its new value.      |

"A changeset contains changes" needs no gloss, and `graph_change.version` is
unambiguous: the entity's version after this change. `GraphVersionService` becomes
`GraphChangeService`.

### What this means before claims exist

Claims are a later step, so the third table arrives without them: **it is the same table
minus three columns.** `graph_change_path` carries `(change_seq, entity_id, path, value)`
now, and gains `source`, `phase` and `confidence` when federation actually overlaps.
Deferring claims defers the resolution policy and those columns, not the structure. So
the snapshot can go now without waiting for anything.

Two refinements make the row count affordable, because a path table on its own would be
worse than snapshots for imports:

- **A create carries a base image, an update carries paths.** `graph_change.base` is
  non-null only on `created`, because a create genuinely *is* all the data and has no
  prior state to diff against. A 10 000 node import writes 10 000 base images and zero
  path rows; an edit writes one path row. The keyframe scheme arises on its own rather
  than being bolted on.
- **Reconstruction is therefore bounded**: the latest base at or before `N`, plus the
  latest value per path since that base. Not a fold over the whole history.

A delete stays an `op` on `graph_change` with no base and no paths.

### Multiple uploads while assuming they are disjoint

That assumption holds for elements and fails for one thing immediately, which is worth
naming so the day it bites is recognised rather than debugged: **both IFC files contain
the storeys.** Every model describes `IfcBuildingStorey`, so the spine overlaps by
construction even when the disciplines do not.

The interim rule that needs no claims: **first writer wins on the spine, disjoint by
construction on elements.** The first import creates `site`, `building` and `storey` and
owns their properties; later imports match into them and contribute only their own
elements, never a competing storey elevation. That is one rule, it is enforceable in the
adapter, and it is correct until two models genuinely disagree about a shared value.

What is given up until claims land: a second model's storey elevation is discarded rather
than recorded, so a real disagreement is invisible instead of queryable; and a hand edit
is overwritten by the next re-import of the file that owns that node. The cheap guard for
the second one, if it bites before claims are built, is a `lockedPaths` set on the node
meaning "a person set this, do not overwrite on import".

What is missing for this to be usable as history rather than as a sync feed:

| Missing            | Consequence today                                                        |
| ------------------ | ------------------------------------------------------------------------ |
| A commit object    | `graph_version` has **no `changeset_id`**, so the rows of one transaction can only be regrouped by heuristics on `(createdAt, actorId)`. There is no message, no intent, no author beyond a uuid. |
| Named checkpoints  | Nothing anchors "as submitted for permit", so "was this compliant at submission" is unanswerable. |
| A read surface     | The version module ships **no controllers**. The log is written and consumed internally and cannot be read by anyone. |
| Retention          | Unbounded and uncompacted, which is fine for audit and unbounded for storage. |

### The four additions

**Commits.** One column and two tables, owned by the graph slice
(`packages/graph-api/drizzle`, journalled in `__drizzle_migrations_graph`).

```sql
ALTER TABLE graph_version ADD COLUMN changeset_id uuid;   -- null = pre-changeset history
CREATE INDEX idx_graph_version_changeset ON graph_version (changeset_id);

CREATE TABLE graph_changeset (
  id          uuid PRIMARY KEY,
  org_id      uuid NOT NULL,
  project_id  uuid,
  actor_id    uuid,                  -- resolved to a person at read time
  actor_type  text NOT NULL,         -- user | serviceAccount | system
  source      text NOT NULL,         -- api | import:imp-arch-r9 | reconciler:adapter.topology.bounds
  intent      uuid,                  -- the procedure node this belongs to, if any
  message     text,
  derived     boolean NOT NULL DEFAULT false,
  caused_by   bigint,                -- the seq that triggered a derived changeset
  depth       smallint NOT NULL DEFAULT 0,
  node_writes int NOT NULL DEFAULT 0,
  edge_writes int NOT NULL DEFAULT 0,
  skipped     int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_graph_changeset_project ON graph_changeset (project_id, created_at DESC);
CREATE INDEX idx_graph_changeset_authored ON graph_changeset (project_id, created_at DESC)
  WHERE derived = false;             -- the default history view
```

No `seq_from` / `seq_to`: the range is a query on `graph_version.changeset_id`, and
storing it would mean updating the row after the sequence values are assigned. The
counts come free, since the batch service already computes that summary. The row is
written in the same transaction as the version rows, so `GraphVersionService.record`
takes the changeset id. `derived` and `caused_by` are what separate a person's edit
from a convergence run, so history shows authored change by default and reveals the
machinery on request.

**Checkpoints, and why they do not need a table yet.** A checkpoint is a name and a
position, so introducing one later is additive with one caveat: you cannot tag a
position the log no longer reaches. Since retention is not built either, nothing is
being lost by waiting, and the table below is written down rather than built.

The part that genuinely cannot wait is different, and it is smaller than a table.
"Was this compliant at submission" needs the **verdicts** frozen, and those cannot be
reconstructed later at any price: a verdict depends on the evaluator version that
produced it, and that version will eventually be deleted. But the thing to attach
them to already exists. The `procedure.*` node *is* the submission: it has identity,
scope, a lifecycle and the intent. So freezing is a block on that node, written when
it transitions to `submitted`:

```jsonc
submission: {
  seq: 41207,                    // the converged log position
  verdicts: [ { ruleId, nodeId, status, actual, expected, deviation,
                ruleVersion, evaluatorVersion } ],
  counts: { pass: 118, fail: 3, skip: 6, review: 2 }
}
```

No new table, no join, and the answer sits on the object anybody asking the question
is already looking at. A `graph_checkpoint` table earns its place later, when
something other than a procedure needs to name a position, or when retention needs an
anchor to fold into.

**The table, for when that day comes.**

```sql
CREATE TABLE graph_checkpoint (
  id         uuid PRIMARY KEY,
  org_id     uuid NOT NULL,
  project_id uuid,
  name       text NOT NULL,
  kind       text NOT NULL,          -- permitSubmission | handover | stage | manual | retention
  status     text NOT NULL,          -- pending until derived state converges, then settled
  authored_at_seq bigint NOT NULL,   -- the changeset that flipped the status
  seq        bigint,                 -- the converged position; null while pending
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
```

A named pointer into the log.

**Who creates them.** Three kinds, and only one is manual:

| `kind`             | Created by                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| `permitSubmission` | a `procedure.*` node reaching `lifecycle.status: "submitted"`, automatically |
| `handover`         | `operations.handover.acceptedAt` being set                                  |
| `stage`            | a project stage transition                                                  |
| `manual`           | a person tagging a position                                                 |
| `retention`        | the compaction policy, so old spans have an anchor to fold into              |

So a checkpoint is normally a **consequence of a workflow transition**, not an act of
its own: the producer that watches the event stream for those transitions creates it.
`retention` checkpoints are marked separately so they can be pruned on a different
policy and never clutter the user-facing list.

**Two positions, not one.** A checkpoint records both the seq of the changeset that
flipped the status (`authoredAtSeq`) and the seq at which the machine finished
(`seq`). They differ, and the difference matters: at the moment somebody submits, the
topology reconcilers may still be running and verdicts may still be `stale`, so
pinning the transition seq would reconstruct a model whose derived state had not
settled. So the producer waits for that project's dirty queue to drain and for no
verdict in scope to be stale, then pins. If convergence never completes because a
producer is broken, the checkpoint stays `pending` rather than silently pinning wrong
state.

**Verdicts are snapshotted, because they are the one thing that cannot be
recomputed.** Everything else at a checkpoint is reconstructible from the log, but a
verdict depends on the evaluator version that produced it, and that version will not
exist forever. So checkpoint creation copies the verdict set for its scope into
`verdict_checkpoint`. That is small: rules times nodes at a handful of positions in a
project's life, not a continuous stream. It is also the literal answer to "was this
compliant at submission", which is the reason the concept exists. Permit submission, handover, end of stage. This is what
makes a verdict snapshot meaningful, and it is the anchor retention has been waiting
for: everything after the newest checkpoint stays verbatim, older spans compact to
their checkpoint images.

**Blame is already there, one level down.** Field-level attribution is the claims
table: `node_assertion` records `(path, value, phase, source, method, confidence,
seq)` per claim, so "who last set the clear height, from which file, with what
confidence" is a row, not a diff reconstruction. Changesets are commits; claims are
blame. Two mechanisms, two questions, no overlap.

**The audit log is the version log, exposed.** Do not copy graph mutations into
`audit_log`: that decision was made on volume grounds and it still holds. Publish the
existing log instead.

```
GET /graph/changesets?projectId=…&actorId=…&derived=eq.false
GET /graph/changesets/:id                     the rows it wrote, before and after
GET /graph/nodes/:nodeId/history              per-entity, newest first
GET /graph/diff?from=<seq|checkpoint>&to=…    latest-snapshot-per-entity, both sides
GET /graph/checkpoints
```

### Where the diffs live: nowhere

They are computed, never stored. `graph_version` holds **full post-state snapshots**
rather than deltas, so every difference is a query over two positions:

```sql
-- the model as of a position, using idx_graph_version_entity (entity_type, entity_id, seq)
CREATE VIEW model_at AS
SELECT DISTINCT ON (entity_type, entity_id) *
FROM graph_version WHERE seq <= $at
ORDER BY entity_type, entity_id, seq DESC;

-- what changed between two positions: compare hashes, not payloads
SELECT a.entity_id, a.content_hash AS was, b.content_hash AS now
FROM model_at($from) a FULL OUTER JOIN model_at($to) b USING (entity_type, entity_id)
WHERE a.content_hash IS DISTINCT FROM b.content_hash;
```

The `content_hash` column already on every version row means "did this entity change"
never touches a jsonb payload; only the rows that actually differ get their snapshots
compared field by field. So one stored representation feeds three derived views:

| View                                  | Derived how                                              |
| ------------------------------------- | -------------------------------------------------------- |
| Per-entity history                    | `WHERE entity_id = X ORDER BY seq`                       |
| The event envelope's `before` / `after` | the snapshot pair at emit time, not persisted            |
| Checkpoint-to-checkpoint diff          | the query above                                          |

Storing deltas as well would be a second representation of one fact, with the usual
consequence: the two drift and the log stops being trustworthy. The cost of choosing
snapshots is that they are larger than deltas, which the engine spec already accepts
(storage grows with edit rate, not model size) and which checkpoint-anchored
compaction is the answer to.

Two things this must get right to be trusted as an audit trail: `actorId` has to
resolve to a person or a service account at read time, and a `derived: true`
changeset must be visibly attributed to its producer, or a convergence run will read
as somebody having edited ten thousand nodes.

## The change spine

`graph_version` is already append-only, globally ordered, carries the full
post-state snapshot, and is written in the same transaction as the canonical row.
Three changes make it a spine.

| Today                                     | Problem                                                              | Change                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `synced_at` column, claimed `SKIP LOCKED` | One column means one consumer. The projection owns it.                | A `change_consumer` table with `(name, cursorSeq, lagMs, status)`.      |
| The snapshot is the payload                | Every consumer diffs again; precise invalidation is impossible.       | Diff once at emit time into a typed envelope carrying `changedPaths`.   |
| A 500 ms poll                              | Too slow to feel live, and polls when nothing happened.               | Keep the poll as the floor, add `NOTIFY graph_change` as a wake-up, never trust it as the transport. |

```jsonc
{
  "seq": 41207,
  "changesetId": "cs-8f21a4",
  "entity": { "kind": "node", "id": "…", "class": "space.circulation" },
  "op": "updated",
  "changedPaths": ["envelope.clearHeight"],
  "before": { "envelope": { "clearHeight": 2.42 } },
  "after": { "envelope": { "clearHeight": 2.24 } },
  "origin": { "source": "ifc:L2-mep-r3.ifc", "derived": false, "depth": 0 },
  "causedBy": null
}
```

`derived` and `depth` are the loop guard: a consumer writing back stamps
`depth: n+1, causedBy: seq`, and the invalidation worker refuses to cascade past
depth 3 and reports the refusal.

| Consumer      | Reacts to                                    | Lag budget                     |
| ------------- | -------------------------------------------- | ------------------------------ |
| projection    | every event                                  | p99 < 5 s                      |
| invalidation  | `changedPaths` in the dependency index        | p95 < 2 s per changeset        |
| binder        | node created, or a selector path changed      | p95 < 2 s                      |
| aggregate     | paths under a maintained roll-up              | p95 < 3 s                      |
| index         | name, class, source text                      | p99 < 30 s                     |
| subscriptions | events matching a client filter               | p95 < 500 ms                   |
| webhooks      | events matching a tenant filter               | at-least-once, ordered per entity |

**Transport in three tiers.** The log is the contract; the transport is an
implementation detail. Tier 1 (now): in-process consumers over cursors, `NOTIFY`
wake-up, SSE fan-out from the same process. Tier 2 (multi-instance): same cursors
and envelopes, fan-out moves to Pub/Sub. Tier 3 (external): a relay publishes to
per-tenant topics with a retained window.

Deliberately absent: no outbox (the version row is domain data in the same
transaction and already is one), no WAL-level capture (it would bypass the layer
that computes `changedPaths`, the only valuable part of the envelope), no broker
in tier 1.

### Incremental recompute

A verdict records its inputs. Invert that into a dependency index at three
granularities:

```
node:4e7c1a92#envelope.clearHeight  → [ rule-clear-height@4e7c1a92 ]        field
node:unit-L2-03#edges:contains      → [ rule-wc-per-unit@unit-L2-03 ]      relation
region:storey-L2#topology           → [ rule-egress-airline@{A,B,…} ]      region
```

Choosing granularity per evaluator is the trick. A wrong region key
over-invalidates, which costs time. A missing field key under-invalidates, which
ships a false pass. **Bias to over-invalidation, always.**

Case `when` paths, constraint `when` paths and `ref` paths are all dependency keys
too, because case selection is an input.

Four properties that make it safe: coalesce per changeset (a 10k-element import is
one dirty-set pass), display staleness rather than blocking, bound and attribute
cascades, and keep recompute idempotent and pull-able so a missed event costs
latency and not correctness.

## Pipelines: keeping derived state true

The question "a rule arrives, how do we create its edges" has a wrong premise worth
correcting first: **it creates no edges.** A rule reaching `active` runs the binder,
which writes one verdict row per matching object. `governs` is asserted only, and it
flows the other way: a human writes it, and the binder *reads* it as an extra input
beside the selector.

The general shape is the more useful answer. Maintaining derived state as an
event handler ("on node updated, patch these edges") gives you a case per
operation times node type times edge type, and every new edge type multiplies it.
Maintaining it as **view maintenance** gives you one case per producer:

> A producer owns every edge of its type within a scope. Given a dirty scope it
> recomputes the whole desired set, diffs against what is there, and emits the
> difference. Nothing patches anything.

That is idempotent, order-independent, crash-safe and restartable, and adding an
edge type adds one function with no new cases.

### Three kinds of work, and one non-case

| Kind          | Shape                                                   | Edges                                                        | Scope         |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------ | ------------- |
| **Mirror**    | 1:1 projection of a field. Exact, no diff needed.        | `contains` / `includes` from `parentId`                      | one node      |
| **Reconcile** | Recompute a set, diff it.                                | `bounds`, `adjacentTo`, `interfaceOf` · `connectsTo` · `hostedIn`, `serves` | storey · building · import |
| **Bind**      | Same as reconcile, output is verdict rows not edges.     | none                                                          | rule × project |
| **Non-case**  | Authored. Validated on write, cascade-deleted with its endpoints, never recomputed. | `governs`, `modifies`, `cites`, `amends`, `supersedes` | n/a |

The scopes are deliberately coarse, following the bias-to-over-invalidation rule:
`bounds` and `adjacentTo` cannot be decided for one room without its neighbours, and
`connectsTo` crosses storeys wherever a stair does, so it takes the building.

### The producer contract

```ts
interface Reconciler<Scope> {
  /** Stamped on every row it writes, so ownership is unambiguous. */
  id: string;                                   // "adapter.topology.adjacentTo"
  owns: { edgeTypes: EdgeType[] } | { rows: "verdict" };
  /** Which scope this change dirties; null means the producer ignores it. */
  scopeOf(event: GraphChange): Scope | null;
  /** Producers that must reconcile first. */
  dependsOn: string[];                          // bounds → adjacentTo → connectsTo
  /** Pure. Same scope state in, same set out. */
  desired(scope: Scope, read: ScopeReader): DesiredSet;
}
```

`origin: { kind: "derived", producer }` on the edge definition is what makes this
work: "what is actually there" is *the rows of my types in this scope stamped with
my id*, so two producers can never fight over the same edge and a diff is always
well defined.

### Every case where derived state moves

| Change                                    | Mirror                  | Reconcile                        | Bind                                        |
| ----------------------------------------- | ----------------------- | -------------------------------- | ------------------------------------------- |
| Node created                              | containment arc if `parentId` | scope dirty if it has geometry | rows for every rule whose selector matches |
| `parentId` changed                        | re-point                | **old and new** scope dirty      | rebind rules reading `parent.` / `storey.`   |
| `class` changed                           | –                       | scope dirty: class gates topology roles | rebind everything selecting on class  |
| Geometry changed                          | –                       | scope dirty                      | rebind rules whose selector reads a geometry path |
| Property changed, in a selector path       | –                       | –                                | rebind that rule for that node               |
| Property changed, anywhere else            | –                       | –                                | –                                            |
| Node deleted                               | cascade                 | **neighbour** scope dirty        | rows archived                                |
| Asserted edge created or deleted            | –                       | –                                | rebind: `governs` is a binder input          |
| Rule created as `draft`                    | –                       | –                                | nothing. A draft never binds                 |
| Rule → `active`                            | –                       | –                                | bind across the project                      |
| Rule → `superseded`                        | –                       | –                                | unbind: archive, never delete                |
| Rule **selector** edited                   | –                       | –                                | rebind that rule                             |
| Rule **criterion** edited                  | –                       | –                                | no rebind; re-evaluate the existing rows      |
| Project fact changed                       | –                       | –                                | rebind rules reading `project.`               |
| Procedure or intent changed                | –                       | –                                | rebind rules with `intents` / `unless`        |
| Source superseded                          | –                       | –                                | rules → `inReview`, their verdicts stale      |
| Import retired                             | cascade                 | every scope it touched dirty     | rows for deleted nodes archived               |

Three things worth pulling out of that table:

- **Deletion needs no edge cleanup.** The edge endpoints are foreign keys with
  `onDelete: cascade`, and the projection maps a node tombstone to `DETACH DELETE`.
  The work a delete creates is entirely in the *neighbourhood*: remove a wall and
  the rooms it separated may now be adjacent, so the storey is dirty.
- **Selector edited and criterion edited are different pipelines.** Changing who a
  rule applies to is a rebind; changing what it demands is a re-evaluation of rows
  that already exist. Conflating them is how you get a full rebind on every
  threshold typo.
- **`class` and `parentId` are mutable**, so those rows are real. (`graph.md`
  describes the identity core as immutable after creation; the update schema accepts
  `class`, `parentId`, `phase` and `name`, so only `id`, `type` and `version` truly
  are. Worth reconciling in that doc.)

### The loop

```
envelope stream (§ the change spine)
  → scopeOf per producer                → dirty_scope (durable, keyed, coalesced)
  → claim a scope, FOR UPDATE SKIP LOCKED
  → run its producers in dependsOn order
  → per producer: desired() vs actual, emit ONE changeset for the diff
  → stamped derived: true, depth: n+1, causedBy: seq
```

- **Keyed and coalesced**: `dirty_scope` is a set, so a 10 000 element import dirties
  one storey once, not 10 000 times.
- **Idempotent**: unchanged scope means an empty diff, and skip-if-unchanged means
  not even a version row. Re-running a producer costs a read.
- **Crash-safe**: dirty marks are rows, claimed the same way the consumer cursors
  are. A crash mid-reconcile re-runs the whole scope, which is safe because the diff
  is recomputed from scratch.
- **Rebuild is the same code path**: mark every scope dirty and the incremental
  pipeline becomes a full rebuild. That is the disposability guarantee made
  operational rather than promised.
- **Generation stamps**: a reconcile triggered from `seq` N that finishes after the
  scope was dirtied again is discarded, not written.

### The cascade, bounded

One authored change walks a fixed number of hops, which is what the depth cap in the
event envelope is sized for:

```
depth 0   a person moves a wall
depth 1   topology reconcilers: bounds, adjacentTo, connectsTo re-diff
depth 2   verdict rows recompute (rows, not graph writes)
depth 3   the compliance summary mirrored onto the node
          → SSE to subscribed clients
```

The cap of 3 is therefore exactly right with no headroom to spare, which is a
constraint worth knowing rather than discovering.

### Where the compute runs

Both, with one rule that decides every case: **the server always holds the current
model state, and only the server writes derived state.**

| Runs where | What                                                            | Authoritative |
| ---------- | --------------------------------------------------------------- | ------------- |
| Server     | every reconciler, the binder, all verdicts, the compliance mirror | yes           |
| Client     | provisional overlays over session state, from `path` and `expression` measures | never |

Reconcilers are server-only without exception. Derived edges are part of the model
state, so deriving them client-side would fork the model between browsers. Verdicts
are server-only because determinism is the audit property: same inputs plus same
rule version must give the same verdict for an agent, an API consumer with no
browser, and a building authority. And in a permit context the client is the
applicant's browser, which is not a trustworthy evaluator.

Client-side compute exists for one reason: a marker has to turn while you drag, and
a round trip cannot do 16 ms. It is confined to read-only, per-session, provisional
results that are labelled as such, never persisted, and never in a report. This is
affordable rather than duplicative because the analyses are pure and isomorphic:
`defineAnalysis` runs unchanged in the browser and on the server, so it is one
artifact with two mount points, not two implementations.

The dividing line, stated once: **writes and derived state are server-only;
provisional reads may be client-side.**

### The client never has to guess whether a recompute landed

Invalidate, refetch and hope is the wrong shape, and it is the shape you fall into if
staleness is not in the data. It is avoidable, because the client already holds the two
numbers that settle it.

A commit returns its `seq`. Every verdict carries `computedFromSeq`. So
`verdict.computedFromSeq < myCommitSeq` means **known stale**, computed and not
guessed, for every verdict whose dependency the commit touched. The client renders that
state as recomputing, with the last known value visible and marked, rather than as
truth or as a blank.

Nothing polls. Verdicts arrive on the session channel as they land:

```
client commits            → { changesetId, seq: 41207 }
inline lane               → provisional markers turn within the frame
verdict.changed (SSE)     → authoritative, computedFromSeq: 41207, replaces provisional
verdict.stale   (SSE)     → "these eight are queued", sent immediately, not on completion
```

The `verdict.stale` event is the part that removes the hope: the server says *up front*
which verdicts it is about to recompute, so the client can mark exactly those and
nothing else. Refetching is the recovery path for a dropped connection, not the
mechanism.

Three consequences worth accepting rather than hiding:

- **The slow lane is visibly slow.** An analysis verdict may take seconds. That interval
  has to read as recomputing in the interface, because the alternative is a stale value
  that looks fresh.
- **A provisional value can disagree with the authoritative one.** That is not a bug, it
  is the honest outcome of computing a field measure in the browser while an analysis
  measure runs on the server. It resolves in one direction only: authoritative replaces
  provisional, never the reverse.
- **Version skew has to be checked.** A stale bundle can compute a provisional result
  with an older analysis version than the server's. The provisional value carries the
  version that produced it, the server advertises current versions on the session
  channel, and a mismatch degrades the value instead of displaying it.

## Materialisation: what we keep, and what a new pipeline costs

Two questions, and the second is the one that bites. Do we keep derived state on the
server or recompute it per reader? And if we keep it, does introducing a pipeline
mean re-running everything?

The answer to the second is yes, and the design's job is to make that **routine
rather than an event**.

### What to materialise

Three tests per derived artifact. Read far more often than it changes; expensive to
compute; its history matters. Any one is enough.

| Artifact                      | Read : change | Cost      | History matters | Kept |
| ----------------------------- | ------------- | --------- | --------------- | ---- |
| Topology edges                | very high     | geometry  | audit only      | yes  |
| Verdicts                      | very high     | analyses  | **yes**, permit record | yes, plus checkpoints |
| `compliance` summary on a node | very high    | trivial   | no              | yes, a fold of verdicts read inside traversals |
| Aggregates (subtree sums)      | high         | moderate  | no              | yes  |
| Provisional client overlays    | once          | cheap     | no              | **never** |

So nearly everything is materialised, and the cost has to be paid honestly:
**every new producer, and every change to an existing one, needs a backfill.**

### Convergence, not migration

The mechanism that makes backfill unremarkable is that **a version mismatch is just
another reason a scope is dirty.**

Every producer carries a version (`adapter.topology.adjacentTo@2.1.0`), and every
row it writes records the version that wrote it. Verdicts already do this with
`evaluatorVersion` and `ruleVersion`. Generalise it and three separate operational
problems collapse into one:

| Situation                    | How the system finds out                             |
| ---------------------------- | ---------------------------------------------------- |
| A node changed               | envelope → `scopeOf` → dirty scope                   |
| A **new producer** ships     | no rows carry its id → every scope in its domain is dirty |
| A producer **version bumps** | rows stamped with an older version → those scopes are dirty |
| A producer had a **bug**     | bump the version; the fix propagates by the same path |

Backfill is therefore not a migration script, not an ops runbook, and not a
deploy-blocking step. It is the ordinary reconcile loop, discovering that its output
is stale relative to the code that produces it, and converging. Which also means it
is **resumable, rate-limitable, observable and interruptible**: a `% converged per
producer` gauge that dips on deploy and trends back to zero, next to the sync-lag
gauge that already exists.

Two properties make this safe to run against live traffic:

- **Idempotence**: an unchanged scope produces an empty diff, and skip-if-unchanged
  means not even a version row. Re-running a converged producer costs reads.
- **Same code path as the incremental case**: there is no second implementation to
  drift, which is the usual failure of backfill tooling.

The cost that remains, and it is real: a large backfill writes a lot of *derived*
version rows, so it should be rate-limited and it should be visible in the log as
`derived: true` with its producer, so nobody mistakes a convergence run for authored
change. A deploy that bumps the geometry producer will re-diff every storey in every
project, and that has to be a background trickle rather than a thundering herd.

### Why not recompute per client instead

Dropping server state removes the backfill problem entirely, which is genuinely
attractive. It fails on five counts, in rough order of how quickly it bites:

1. **The client does not have the data.** Egress needs a whole storey's topology; a
   portfolio question needs every project. Compute-on-read means shipping the model
   to the browser.
2. **Agents and API consumers have no client.** An MCP tool call, a webhook
   subscriber and a nightly report must get the same answer as the viewer.
3. **Determinism is the audit property.** A building authority needs the verdict as
   computed at submission, from the inputs it read, under the rule version then in
   force. A recompute cannot reconstruct that; only a stored row with its stamps can.
4. **N readers means N times the same compute**, and they disagree while propagating.
5. **Cross-cutting questions become impossible**: "every project failing § 34" is a
   query over stored verdicts or it is nothing.

And the one thing server-only cannot do is the reason the client computes at all: a
marker has to turn inside a frame while you drag, and no round trip does 16 ms.

So the split stands, and it is worth stating as a single rule: **the server holds the
state and owns every write; the client computes only provisional, per-session,
read-only overlays.** Affordable because `defineAnalysis` is pure and runs unchanged
in both places, so it is one artifact with two mount points.

### The version-skew hazard this introduces

Once producers are versioned, a client running an older bundle can compute a
provisional result from a *different* version than the server's authoritative one:
a stale tab shows provisional `pass` while the server says `fail`. That is worse than
a slow answer, because it looks authoritative.

So a provisional result carries the producer version that computed it, the server
advertises its current versions on the session channel, and the client discards or
visibly degrades any provisional value whose version does not match. The same
`evaluatorVersion` stamp that makes convergence work is what makes the client honest
about skew.

## Collaboration

Two clocks, one log. A four-second drag produces roughly two hundred intermediate
states and exactly one deserves a version row.

| | Session clock                            | Commit clock                                  |
| ---------- | ---------------------------------------- | --------------------------------------------- |
| Carries    | presence, in-flight edits, provisional verdicts | assertions, resolved values, authoritative verdicts |
| Tick       | 10 to 50 ms                              | one per changeset                             |
| Durability | none, memory only                        | Postgres, append-only, replayable             |
| Transport  | WebSocket, bidirectional                  | the log plus a cursor                         |
| Conflict   | shown as presence                        | both claims kept, policy resolves, conflict flagged |

The **commit boundary** is the whole design, and it is per interaction: on gesture
end, on idle (roughly 600 ms), or explicit for structural change. A commit per
frame would tie the log to pointer movement, which is the one property the spine
exists to protect.

**Three recompute lanes, routed by the dependency granularity already recorded:**

| Lane   | Measures                          | Runs                            | Budget       | Verdict is                          |
| ------ | --------------------------------- | ------------------------------- | ------------ | ----------------------------------- |
| inline | `path`, `expression`              | in the browser, on session state | < 16 ms      | `provisional`, never persisted      |
| fast   | + `relation`                      | on the commit path              | p95 < 300 ms | authoritative, stored with inputs   |
| slow   | `analysis`, `aggregate`           | queued per region, cancellable   | seconds      | `stale` with its last value         |

Granularity and latency class are the same fact seen twice. Keyed coalescing on
`(ruleId, nodeId)`, generation stamps so a result from a superseded `seq` is
discarded, and cancellation when a region is re-dirtied.

Conflict needs no new machinery: the claims model keeps both writes and flags the
disagreement, so collaboration renders a badge rather than arbitrating. **No CRDT
for the structured model.** The honest exception is free prose, where
character-level merge is genuinely wanted; that one field type gets a CRDT and
nothing else does.

Two consequences: a WebSocket is sticky, so **collaboration is what pulls
transport tier 2 forward**, not consumer count. And variants widen the verdict key
by `scenarioId`, which is one column now and expensive to retrofit.

## Contracts structure

Four concepts, and the folder names are the concepts. What is shared is shared
because it is the same on the wire; what is split is split because it genuinely
differs per type: **class taxonomy, block set, edge set**. Splitting the wire
schemas per type would triple the API surface to express a difference that is not
on the wire.

```
contracts/src/graph/
  registry/                     the kit a type declares itself with
    node.type.ts                the three structural types
    block.ts                    defineBlock
    edge.ts                     defineEdge + PARENT_ID_PRODUCER
    index.ts
  object/                       ─┐
    class.root.ts                │ every type folder
    class.taxonomy.ts            │ declares its own
    blocks/  envelope programme material finishes systems geometry interop
    edges/   contains bounds adjacent-to connects-to
             hosted-in interface-of serves
    index.ts                     │ vocabulary and
  rule/                          │ exports one
    class.root.ts                │ manifest
    edges/   governs modifies    │
    index.ts                     │
  source/                        │
    class.root.ts                │
    edges/   includes cites amends supersedes
    index.ts                    ─┘
  vocabulary.ts                 composes the manifests: CLASS_ROOTS, EDGE_TYPES,
                                EDGE_DEFINITIONS, CANONICAL_BLOCK_KEYS,
                                containmentEdgeFor, classifyVocabulary,
                                GRAPH_VOCABULARY
  wire/                         identical for every type: what the API speaks
    node.schemas.ts  node.filters.ts  node.errors.ts
    edge.schemas.ts  edge.filters.ts  edge.errors.ts
    batch.schemas.ts batch.errors.ts  query.schemas.ts  query.errors.ts
    health.schemas.ts
    scope.ts                    how a caller addresses a collection
    property.ts                 the property bag, its key list, the projection
    index.ts
  index.ts                      the public barrel
```

**Where an edge belongs: with the type at its `from` end.** `governs` is a rule
edge though it points at objects, because the rule is the actor and the rule
surface is what has to know about the binding. That one rule files all thirteen
edges, and it needs no cross-cutting folder: an edge whose two ends sit in
different trees is a sign of two relations sharing one name, which is why the
`parentId` mirror is `contains` for objects and `includes` for sources rather than
one edge spanning both.

There is no folder named `base` or `common`. Both are names for a bucket rather
than a concept, `contracts/src/common/` already exists as the package-level shared
layer, and two folders called `common` at different scopes in one package read
badly. `wire/` says what the files are: the request and response surface. The
dependency runs one way, registry → type folders → `vocabulary.ts` → `wire/`,
with one documented exception: `wire/edge.schemas.ts` imports the composed
`CANONICAL_EDGE_TYPES` to interpolate it into an OpenAPI description, which
creates no cycle.

A type's `index.ts` is its manifest: `{ nodeType, classRoots, blocks, edges }`.
Composition lives in `vocabulary.ts` rather than in a shared folder, so one file
and only one knows about all three types.

**As built, versus as specified above.** The restructure is landed; the vocabulary
changes it would imply are not, deliberately, so the move is reviewable as a pure
reorganisation:

- The canonical lists carry the new values (`rule`, `source`, `governs`); stored
  rows, fixtures and the sibling cbm-demo / locus-* repos still carry the old
  ones, which the classifier counts as drift rather than rejecting. Migrating
  the data and the fixtures is the separate change described in Status.
- `rule/blocks/` and `source/blocks/` do not exist yet, and the manifests declare
  an empty block set. `selector`, `criterion`, `enforcement`, `citation`,
  `publication`, plus the universal `provenance` and near-universal `lifecycle`,
  land with the rule and source surfaces.
- The new class roots from the roots proposal (`project`, `import`,
  `procedure.*`) are not added yet, and no endpoint list names them: an edge may
  only reach roots the vocabulary has.
- `defineEdge` metadata is declarative and has no reader yet. `symmetric`,
  `transitive`, `cardinality` and the endpoint lists describe write
  canonicalisation, pattern emission, exclusivity caps and endpoint drift that
  the services do not implement. `origin` and `PARENT_ID_PRODUCER` are the
  exception: `containmentEdgeFor` reads them, and the projection reads that.
- `defineEdge` names the wire value `value`, not `type`, matching `NODE_TYPES` and
  `CLASS_ROOTS` so the composed `EDGE_TYPES` keeps its existing
  `{ value, description }` shape and every consumer compiles untouched.

## Agent surface

Text-to-Cypher tops out near 60 per cent execution accuracy, so agents get typed
tools over the same registry the interface uses, never a query language.

`findNodes` `readNode` `listVerdicts` `explainVerdict` `runAnalysis` `cite`
`proposeRule` `whatIf` `subscribe`.

`explainVerdict` and `whatIf` exist only because of L4. The first makes "why does
this fail" a lookup rather than a generation, so it cannot hallucinate a reason;
the second evaluates a hypothetical without writing. Every answer carries node
ids, verdict ids and source anchors, so every claim resolves to a quote or a
measured value.

## Guardrails

| Rule                                                    | Mechanism                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Derived state is disposable, asserted state is sacred    | Everything computed names its producer and input sequence: topology edges, bindings, verdicts, aggregates, the projection, the resolved property bag. |
| Open vocabularies, canonical lists, counted drift        | Node type, edge type, class, block key, operator, evaluator, level. Open strings with an exported canonical list and a drift counter. |
| Fail closed on every unknown                             | Unknown operator, missing precondition, unreviewed rule, no case matched, no active constraint: `skip` or `error` with a reason. |
| Schemas describe, they do not gate                       | Zod with passthrough; unknown keys accepted, per-node conformance computed.                    |
| One identity, many assertions                            | Node identity immutable and source-independent; participants and phases add claims.            |
| The identity core is closed                              | Every type-specific dimension goes into `class` or a block.                                    |

## Decisions

| Decision                                                              | Rejected                                                         | Would reverse if                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `object` / `rule` / `source`, one six-field identity core              | `object` / `requirement` / `reference`                            | Nothing. That trio mixed a category, a specific thing, and a pointer.            |
| The identity core is closed; no `phase`, no `level`                   | Type-specific fields in a shared core                             | Nothing. `phase` was also a second home for a fact that lives on claims.         |
| Verdicts are rows with a four-field mirror on the node                 | No verdict storage, or verdicts in node properties                | Nothing. Without stored verdicts there is no dependency index; in node properties they would put the highest-churn data into a log meant for authored change. |
| A selector binding is a verdict row; `governs` is asserted only        | An edge per matching node                                        | Nothing found. The row carries both ids plus a status the edge cannot hold.       |
| Rules are nodes with identity, version, review                         | A `rules` block inlined on each object                            | Nothing at scale. Inlining makes one threshold correction a 10 000 node write.    |
| A source node is a spine; text and locators live in `files-api`        | Mirroring text, offsets and hashes onto the node                  | Nothing. Re-parsing must write zero graph rows.                                  |
| Derived state is materialised on the server and converges by producer version. | Compute on read, per client, keeping no derived state. | Nothing. Dropping state removes the backfill cost but the client lacks the data, agents have no client, and a stored verdict with its stamps is the only thing that can answer what was true at submission. The backfill cost is paid by making convergence the ordinary loop rather than a migration. |
| Session and commit are separate clocks meeting at a commit boundary    | One mechanism: a CRDT over durable state, or a commit per frame    | Nothing. Either ties the log to pointer movement or duplicates the claims model.  |
| Transport stays in Postgres until multi-instance                       | A broker from day one                                             | A second instance ships, or an external consumer signs a contract. Both are tier changes. |
| Operations data is bindings plus rolling aggregates                    | Readings as nodes, or no operations layer                         | Never for raw series: it would tie the version log to sample rate.               |
| LLMs formalise and explain; deterministic operators decide             | A model evaluating compliance directly                            | Nothing on current evidence.                                                     |

## Coverage, measured

Both statutes run end to end through segment, detect, formalise, report.

| | BauGB (federal, planning) | LBO BW (state, building) |
| ------------------------------ | ------------------------- | ------------------------ |
| Characters / § sections         | 463 423 / 289             | 200 407 / 97             |
| Candidate sentences             | 102                       | 161                      |
| Candidates per 100k characters  | 22                        | 80                       |
| `length` markers                | 2                         | 74                       |
| Quantitative in substance       | 73 of 102                 | 138 of 161 (86%)         |
| Sections yielding a criterion   | 39 of 289 (13.5%)         | 30 of 97 (30.9%)         |
| Rules binding to building fabric | 5                        | the substantial majority |

Two different numbers, routinely confused. **Coverage** is what fraction of a
corpus yields a criterion, and it is mostly a property of the statute: BauGB's 13
per cent is correct, because BauGB regulates procedures, plans and compensation,
not clear heights. **Expressiveness** is what fraction of the genuinely
quantitative rules the schema can hold, and that one is on us: 42 per cent before
cases, referenced bounds and intents, 72 per cent after, 87 per cent with the
structural five.

BauGB also demanded four class roots the vocabulary did not have (`procedure.*`
30 criteria, `claim.*` 11, `plan.*` 10, `document.*` 1), and none required a
schema change or a new node type. That is the open-vocabulary decision earning its
place; a closed enum would have made hosting BauGB a breaking release.

## Sequencing

| Phase | Lands                                                                                                   | Gate                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| P0    | Fabric, versioning, projection, free Cypher, agent with a graph tool                                     | Shipped                                                                 |
| P1    | The rename; the four rule blocks; the operator vocabulary; the selector binder writing verdict rows; the mirrored `compliance` summary | Verdicts reproducible across two runs; coverage report renders          |
| P2    | Consumer cursors, typed envelope with `changedPaths`, invalidation worker, dependency index, SSE stream   | Dirty set provably a superset of what changed; cascade depth bounded    |
| P2.5  | History as a surface: `changeset_id` on the version log, `graph_changeset`, `graph_checkpoint`, and the read routes (`/graph/changesets`, `/graph/nodes/:id/history`, `/graph/diff`) | A convergence run and a person's edit are distinguishable in the log; two checkpoints diff without replay |
| P3    | Source spine, `extraction` tables, formalisation with draft and review, amendment flow                    | Anchor drift detected on re-upload; no unreviewed rule evaluates as mandatory |
| P4    | Assertion log, resolution policy, phase-scoped claims, programme-versus-built diff                       | Resolved bag rebuildable from assertions; conflicts queryable           |
| P4.5  | `criterion.cases`, referenced bounds, `selector.intents`, then the structural five, `measure.method`, a classification stage | LBO BW expressiveness 42% → 87% on the same 161-sentence corpus; no statutory sentence shattered into more than one rule node |
| P5    | Analysis-backed rules with region dependencies: egress, connectivity, clash                              | Region invalidation measured against a full recompute on 10k nodes      |
| P6    | Collaboration: session channel, commit boundaries, provisional verdicts, three lanes, transport tier 2   | One version row per drag; no provisional verdict reaches a report       |
| P7    | Operations bindings, rolling aggregates, in-use rules, webhooks                                          | Version log growth still tracks edit rate, not sample rate              |

## SLO targets

| Metric                                             | Target                     | Measured                        |
| -------------------------------------------------- | -------------------------- | ------------------------------- |
| Commit to graph projection visible                  | p99 < 5 s                  | 574 ms on a six-node model      |
| Commit to verdict recomputed, single property edit  | p95 < 800 ms               | not built                       |
| Commit to a collaborator's repaint                  | p95 < 400 ms               | not built                       |
| Full storey revalidation, 10k nodes, 40 rules       | p95 < 20 s                 | not built                       |
| Travel-distance query on a 10k node project         | p99 < 200 ms               | 2 ms on a six-node model        |
| Replay from sequence zero                           | < 60 s per 100k version rows | not measured                  |
| Stale verdict fraction during steady editing        | < 2 per cent               | not built                       |
| Version rows produced by one four-second drag       | exactly 1                  | not built                       |

## Standards crosswalk

The single home for how this vocabulary lines up with the standards it borrows
from. It used to live in about thirty code comments; those are gone. A crosswalk
is reference material, not a durable "why" for a line of code, and scattered
copies drift. Nothing in the code depends on any of this.

**BOT** (Building Topology Ontology), conceptual alignment, not a prefix:

| Here                                    | BOT                                     |
| --------------------------------------- | --------------------------------------- |
| `site`, `building`, `storey`, `space`   | subclasses of `bot:Zone`                |
| `element.*`                             | `bot:Element`                           |
| `interface`                             | `bot:Interface`                         |
| `contains`                              | `bot:containsZone` / `bot:containsElement` |
| `bounds`                                | `bot:adjacentElement`                   |
| `adjacentTo`                            | `bot:adjacentZone`                      |
| `hostedIn`                              | `bot:hasSubElement`, inverted           |
| `interfaceOf`                           | `bot:interfaceOf`                       |
| `connectsTo`, `serves`, `governs`, `cites`, `amends`, `supersedes` | no BOT equivalent |

**IFC**: the importer records the source identity per node in the `interop` block
(`{ format, source, sourceId, sourceClass }`), so an `IfcSpace` and its Revit twin
land on one node. Spatial containment arrives as
`IfcRelContainedInSpatialStructure` and becomes `parentId`; it is not preserved as
a relation of its own.

**LOCUS**: the platform's node model started from the LOCUS description framework
(identity core plus modular capability blocks) and has since diverged: six identity
fields instead of seven, `rule` and `source` instead of `requirement` and
`reference`, an open vocabulary with drift counting instead of a closed enum, and
blocks as the type system. Treat LOCUS as ancestry, not as a contract.

## Not in this spec

- The nine deferred expressiveness gaps (G3 to G12 above), each with its sketch.
- An org anchor node, deferred until something needs to hang off one.
- A `modality` field on `enforcement` (obligation, prohibition, permission,
  entitlement, power). The dominant case is obligation; permissions are handled by
  the deviation record.
- Scenario branching beyond the `scenarioId` key reservation.
- Retention and compaction of the version log. The checkpoint concept above is the anchor it was waiting for; the policy itself is still unwritten.
- Public or system node tier; per-org canonical vocabulary extensions.
- Realtime write-back from the graph DB: a non-goal.
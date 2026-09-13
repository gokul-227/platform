# Rule extraction

How a regulation document that a person uploaded becomes reviewed `rule` nodes
bound to the fabric, and how what could not be extracted stays visible.

[`cognitive-building-model.md`](cognitive-building-model.md) is authoritative for
what a rule, a source and a verdict *are*; this document is the implementation
design for the P3 row of its sequencing table (source spine, extraction tables,
formalisation with draft and review) plus the P1 binder that makes the result
mean something. Read the Rules, Sources and Pipelines sections there first.
Nothing here changes the model.

## What this is

A person picks a document in the file browser and triggers an extraction. The
run reads the document's own structure, decides per unit whether it carries a
normative statement, asks a model to formalise the ones that do, writes them to
the graph as `draft` rules with their quote and their source anchor, and reports
what it could not do and why. A person then accepts, edits or rejects each
draft. Accepted rules bind to the fabric by selector, and a check produces one
verdict row per rule and matching object.

Two things it deliberately is not. It is not an upload preset: formalisation
costs money and needs review, so it is always explicitly triggered, while
segmentation is cheap, deterministic and runs with the index. And it is not a
compliance engine of its own: the LLM formalises and explains, deterministic
operators decide.

## What already exists

Worth knowing before anything is built, because most of the plumbing is here.

| Exists                                                        | Where                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Extracted markdown, chunks with heading and page, hybrid search | `files-api` `file_index`, `file_index_chunk`                     |
| An explicitly submitted, worker-driven, per-file step with a state route | `files-api` `modules/files/index` (submit, state, worker, seams) |
| A second step proving the port pattern: two host-bound ports, a queue table, a settler clause | the `ifc` step (`ModelTranslator`, `ModelGraphSink`) |
| Idempotent graph writes: `upsert` by client-supplied deterministic uuid, content-hash skip, 1000 ops per kind | `graph-api` changeset, `graphNodeUpsertOpSchema`  |
| `rule` and `source` class roots, `governs` / `modifies` / `includes` / `cites` / `amends` / `supersedes` edges | `contracts/src/graph/{rule,source}`               |
| The canonical vocabulary bundle with per-value descriptions     | `contracts` `GRAPH_VOCABULARY`, SDK `client.graph.vocabulary`     |
| A LangGraph agent with graph, document, node-read and node-write tools, Vertex per tier | `threads-api` `thread.run.graph.ts`                    |
| Self-describing analyses (`params` schema, `run`, `tool` descriptor) with a registry, designed to mount as card, tool and route | `@aec-craft/cbm-analysis` in `cbm-demo`   |

Two things are missing rather than incomplete: `RULE_MANIFEST.blocks` and
`SOURCE_MANIFEST.blocks` are empty, and the vocabulary has no HTTP surface at
all, so nothing outside a TypeScript build can read it.

## Stages

The spec's five stages plus a triage pass, with an owner each. The owner matters
because `graph-api` never touches a document and `files-api` never reaches into
the graph; every crossing is a port the host binds, the way the `ifc` step
already does it.

| Stage      | Owner                    | Deterministic | Failure is                                    |
| ---------- | ------------------------ | ------------- | --------------------------------------------- |
| structure  | `DocumentStructurer` port | no           | Silent *and* non-deterministic, which is why reconciling against the document's own table of contents is a precondition of the run rather than a warning on it |
| extract    | `RuleFormaliser` port    | no            | Expected, near one in four. A draft is a hypothesis |
| review     | a person                 | n/a           | The gate. No unreviewed rule evaluates as mandatory |
| bind       | `graph-api`              | yes           | Visible. Rules that bind to nothing are a counted gap |
| evaluate   | `graph-api` + analyses   | yes           | Reproducible. Same inputs and rule version, same verdict, forever |

### Not the retrieval chunks, and not a hand-written parser either

Do not extract from `file_index_chunk`. Chunks are retrieval-shaped: fixed size,
heading-prefixed, overlapping. Rules are statute-shaped: paragraph, Absatz, Satz,
Nummer. A chunk boundary inside a Nummer shatters one rule across two windows and
the overlap proposes it twice, with a heading rather than an address as its
citation.

A hand-written segmenter is the other wrong answer, because it is a per-genre
treadmill: a German statute, a DIN norm, an ISO standard, a spreadsheet brief and
a client design guide share nothing but depth. What they do share is that a model
can see the depth and name it, which is what the open `level` vocabulary with
counted drift exists to accept.

**The model returns boundaries, never content.** Per unit it emits a label, a
level, an ordinal, its parent, and an anchor string (the unit's opening words).
Code locates each anchor in the source and slices the text deterministically.

Not offsets, because models cannot count characters. Not the text itself, because
then a statute's wording is model output: `provenance.quote` would cite a
paraphrase, `text_sha` would move with the temperature, and drift detection on a
re-upload would compare two hallucinations. An anchor that does not match exactly
once is a flagged unit, never a silently misaligned one. The model does judgement,
the code does arithmetic.

```
extraction        id, file_id (nullable), profile, structurer,
                  structurer_version, structure_version, status, unit_count,
                  toc_reconciled, error, attempts, timestamps
extraction_unit   extraction_id, structure_version, logical_path, parent_path,
                  level, ordinal, label, text, text_sha, page, char_range
```

The join key to the graph is `(fileId, logicalPath)`, which is what a source
node's `citation` block carries. Nothing extracted is mirrored onto a node, so
re-parsing writes zero graph rows, which is the point: re-parsing is the most
frequent operation in this pipeline. A document longer than one window is
structured in overlapping passes and stitched by matching the ancestor path
across the seam.

Reconciling against the document's own table of contents stops being a nicety
here. The structurer is the one stage that can drop a whole Teil without erroring,
so the run refuses to report on a disagreement.

### Which puts a version on the structure

A non-deterministic structurer has one consequence worth naming before it bites.
A re-run can produce a different tree, and `logical_path` is the address rules
cite by, so a naive re-structure silently re-points every citation.

Hence `structure_version`. A structure freezes once rules have been extracted
against it; a re-structure writes a new version and diffs at path level. Where a
path's `text_sha` is unchanged its rules move across untouched; where the text
changed or the path vanished the affected rules are flagged for review rather than
re-pointed on a guess. That is the same drift machinery the amendment flow needs
for a revised statute, doing double duty.

### Then every paragraph, with no triage

No prefilter and no cheap detect pass. A keyword list generalises to neither
another statute nor another language, and building one that does is a large amount
of work whose payoff is a saving we do not need. Every paragraph in the structure
reaches extraction, and the call returns zero, one or several rules plus its
disposition, so "there is nothing normative here" is an answer the extractor
gives rather than a guess something upstream made on its behalf. That also makes
the coverage denominator honest: every paragraph in the tree, accounted for by
the stage that read it.

The call is scoped to a paragraph **with its children and its ancestor labels**,
which is a correctness requirement rather than a batching choice. In § 5 (7) LBO
BW the statutory Nummer order is not the evaluation order, so a call seeing one
sentence in isolation cannot produce `criterion.cases` with the right `order`: it
hands every plot in a Kerngebiet 0,4 instead of 0,2 and passes a setback it should
have failed.

One paragraph in, zero to several rules out. A paragraph carrying three
obligations is three rule nodes; a single statutory sentence must never shatter
into more than one. Cost is a few structuring calls plus one per paragraph, so 97
for LBO BW and 289 for BauGB, the same order a two-tier pipeline would have cost
with one prompt instead of three.

The extraction call also returns every citation string it saw (`§ 6 Abs. 3`,
`DIN 4109`) as an unresolved list, which costs nothing while it is reading anyway.
Resolution is later work; the raw sightings are what make the `unresolved`
disposition actionable rather than merely counted.

## Grounding: what the model has to be told

The classes are open and dynamic, so a fixed list of wished-for class names in a
prompt is exactly the wrong shape. The model needs two different things, and
they are different because one is stable and the other is live.

**The taxonomy: what the vocabulary means.** Static per deployment, derived from
the registry, cacheable, no scope. `GET /graph/taxonomy` answers a summary (node
types, class roots, edge types, block keys, the operator vocabulary, the path
grammar) and `?detail=<value>` answers one entry in full: for an edge, its
endpoints, symmetry, cardinality and transitivity; for a block, its field paths
and units. The bundle exists in `contracts` already and the field-path walker
exists in `threads-api`; this route is a composition of the two, not new
knowledge. Today the only consumer able to read any of it is a TypeScript build,
which is why the vocabulary lives in prompts as prose and drifts.

**The census: what this project actually contains.** Live, scoped, and the thing
that makes mapping possible: which classes exist with what counts, which
`programme.use` values are in play, which block keys and property paths are
populated per class, which edge types have rows, and what is drift. Implemented
as an analysis (`quality.census`) rather than a bespoke route, so it mounts as an
HTTP route, an MCP tool, an agent tool and a module card from one definition.

### Class to class, property for the comparison

The primary axis is class matched against class: `selector.classes` picks the
objects and `where` only refines. A kitchen is `class: "space.kitchen"`, and the
model spec's own examples work exactly this way (`space.circulation`,
`space.sanitary`, `space.office` and `space.treatment` are all class leaves in
it). So a minimum-area rule reads:

```jsonc
"selector": { "classes": ["space.kitchen"] },
"criterion": {
  "measure": { "type": "path", "path": "envelope.areaNet", "unit": "m2" },
  "constraints": [{ "operator": "gte", "value": 6 }]
}
```

Class answers who the rule is about; a property path answers what gets measured.
Two jobs, and they should not share one field.

`programme.use` is the second axis, not the first. The class leaf is the durable
typological kind; the use is the current one, which is what a Nutzungsänderung
changes. A rule reaches for the predicate when the regulation is genuinely about
use rather than room type, which in the German corpus is common enough to matter
(`Aufenthaltsraum`, a use in a Kerngebiet, an occupancy that triggers the
requirement). The split exists so a change of use is an ordinary property write
rather than a re-classification, not to push room types out of the class.

What is narrower than it first looks: there is no `object.` prefix on a class,
because the first segment resolves the type. `space.kitchen`, never
`object.space.residential.kitchen`.

#### Which surfaces a real gap in the contracts

`CANONICAL_CLASSES` enumerates element leaves (`element.wall`, `element.door`,
ten more) and, for spaces, exactly one entry: `space`. No leaves at all. The list
is advisory and open, so nothing rejects `space.kitchen`, but nothing suggests it
either, which means the IFC importer and the rule extractor each invent a
spelling and the rule binds to nothing.

So a space leaf set belongs in the same change as the rule blocks: small,
advisory, additive, and the one mapping target both sides aim at. The census then
checks what the fabric in front of you actually uses, and a rule that binds to
nothing is a counted gap rather than a pass, so a convention mismatch is visible
instead of silent.

One caution on the measure. `areaNet` against `areaGross` is the same hazard as
the Rohbaumaß problem behind gap G10: a criterion reading a plausible
neighbouring quantity returns `pass` with full provenance and is wrong, which is
worse than a visible hole.

### The model asks, rather than being told

Neither of these belongs pasted into every call. The vocabulary grows, the census
is project-sized, and a prompt carrying both pays for all of it on every paragraph
while the model reads two lines. Give the extractor tools and the knowledge that
they exist, and let it fetch what the paragraph in front of it needs.

That is the model spec's own decision about agents arriving here rather than being
invented: agents get typed tools over the same registry the interface uses, never
a query language. It also retires an existing drift, since
`thread.run.vocabulary.ts` renders block field paths into the thread agent's
prompt today and that mirror is kept in step with the schema by hand.

| Pushed into the prompt                              | Pulled by tool call                             |
| --------------------------------------------------- | ----------------------------------------------- |
| The three node types, and that a class root resolves the type | Which class leaves exist, with what counts |
| The operator vocabulary                              | Which `programme.use` values this project spells |
| The six measure variants                             | A block's field paths and their units            |
| The output schema and the validation rules           | An edge type's endpoints, symmetry, cardinality  |
| Enough to form *any* answer                          | What makes *this* answer specific                |

The grammar of the answer is stated; the content of the answer is fetched. The
pushed half is small and identical for every call in a run, so it is a cached
prefix rather than a per-call cost, which is what makes the split cheap rather
than merely tidy.

Two tools cover it. `graph_taxonomy(entry?)` answers the summary or one entry in
full, `graph_census(class?)` answers what this project holds, and both are
descriptors over the same registry, so the extraction agent, the thread agent and
any MCP client read one definition instead of three copies.

One constraint the pull model adds: if the ground can move between calls, two runs
over one document can disagree for reasons that have nothing to do with the
document. So the census is read **once per run and pinned**, and `extraction_run`
records the taxonomy version it saw beside the model and the prompt version.
Within a run the ground is fixed; across runs a difference is attributable.

## Analyses: the catalogue, the store, and where the package lives

Free Cypher was right for the exploration phase and is wrong as the long-term
contract: text-to-Cypher tops out near 60 per cent execution accuracy, scalar and
map projections defeat the post-filter scope check, and every consumer reinvents
the same traversals. The analyses in `cbm-demo` are already the answer. They are
in the wrong repository, and they are missing a dialect.

### Most analyses do not need the graph at all

A takeoff is a filter, an aggregate and a group-by over rows. Postgres does that
better than Cypher does: it is the source of truth so there is no projection lag,
the JSONB path operators and the list-filter framework already exist, and the
rows are indexed. Cypher earns its keep only where the question is genuinely
about traversal, which means variable-length patterns, path semantics, reachability
or distance.

This is not a new idea to bolt on. `QuerySpec` in the analysis package is already
a dialect-agnostic description of selection, filtering, aggregation and grouping,
and its own doc comment names the missing half: "SQL over the Postgres jsonb
source of truth is a future dialect". So the seam is cut and unused. Implementing
`sqlDialect` beside `cypherDialect` moves every rows-shaped analysis onto the
source of truth without touching a single definition.

Which turns "which store" into a declared property rather than a hardcoded
choice. `needsGeometry?: boolean` on the `Analysis` interface generalises to a
declared need:

```ts
needs: ("rows" | "traversal" | "geometry")[]
```

Three consequences fall out of that one field. A deployment with no graph
database still serves every rows-only analysis, which is the capability-degrades
rule applied here rather than restated. An analysis can move from Cypher to SQL
as a performance change with no caller aware of it. And the mount can refuse a
traversal analysis with one clear error instead of failing inside a driver.

### The catalogue

Thirty, grouped by namespace, with what each needs and where it stands. `rows`
means it answers from Postgres; `traversal` means it needs the projection;
`geometry` means it needs shapes.

| Analysis | Answers | Needs | State |
| -------- | ------- | ----- | ----- |
| `quantity` | Count or aggregate any field over a class, filtered and grouped | rows | ships |
| `quantity.schedule` | The room schedule: every space with area, use, storey, occupancy | rows | next |
| `quantity.material` | Volumes and areas by material | rows | next, wants the material block populated |
| `quantity.opening` | Door and window counts and areas per space | rows + traversal | next |
| `indicator.ratio` | Any quantity over any other | rows | ships |
| `indicator.netToGross` | NGF over BGF | rows | next |
| `indicator.circulationShare` | Circulation over usable area | rows | next |
| `indicator.occupancyDensity` | Persons per square metre | rows | next, wants occupancy |
| `indicator.daylightArea` | Window area over floor area per room (§ 34 (2) LBO BW) | rows + traversal | next, and the G10 hazard lives here |
| `indicator.compactness` | Envelope area over volume | rows + geometry | complex: wants real envelope areas |
| `spatial.connectivity` | Is the model connected, and which components | traversal | ships |
| `spatial.route` | Shortest route between two spaces | traversal + geometry | ships |
| `spatial.egress` | Travel distance to the nearest exit, with rule presets | traversal + geometry | ships |
| `spatial.reachability` | What is reachable from here within N metres or hops | traversal | next |
| `spatial.adjacency` | The adjacency matrix, or what touches this space | rows | next |
| `spatial.travelMap` | Per-room distance to exit, as a field for the viewer | traversal + geometry | next, falls out of egress |
| `spatial.deadEnd` | Corridors with one way out beyond a length limit | traversal + geometry | complex |
| `spatial.secondEscape` | Two independent escape routes (node-disjoint paths) | traversal | complex, and the highest regulatory value on this list |
| `spatial.stairLoad` | Occupants assigned per stair against its width | traversal + rows | complex: needs occupancy, widths and a catchment rule |
| `spatial.accessibility` | Step-free reachability (DIN 18040) | traversal | complex: needs level-change classification |
| `quality.consensus` | Which fields most nodes of a class carry, and the outliers | rows | ships |
| `quality.census` | The class, use, block and path census with counts and drift | rows | next, and the extractor depends on it |
| `quality.orphan` | Nodes with no parent, no edges, or a dangling reference | rows | next |
| `quality.interop` | How many nodes carry a source identity, by import | rows | next |
| `quality.geometryCoverage` | Real footprint versus fallback bounding box | rows | next |
| `quality.duplicate` | Likely duplicates: same class and name, near-identical centroid | rows + geometry | complex |
| `compliance.summary` | Counts by status, worst deviation, per storey | rows | blocked on verdicts, then easy |
| `compliance.byRule` | Per rule: how many bound, how many pass | rows | blocked on verdicts, then easy |
| `compliance.unbound` | Active rules that matched nothing | rows | blocked on verdicts, then easy |
| `compliance.stale` | Verdicts standing behind the log head | rows | blocked on the change spine |

Seventeen of the thirty answer from rows alone, which is the measured version of
the instinct: the graph database is for eleven of them, and shapes for six.

Two families deliberately left off. `clash.hard` needs real solids rather than
plan footprints, so it is a different geometry problem and not a near-term one.
`cost.estimate` and `cost.carbon` are quantities multiplied by reference data,
so they are blocked on a dataset rather than on code, and they should not be
started until somebody owns the dataset.

Note what the "complex" column actually blocks on, because only one entry is
blocked on an algorithm. `spatial.secondEscape` needs node-disjoint paths, which
is real work. Everything else is blocked on data that is not populated yet
(occupancy, stair widths, envelope areas) or on a classification pass that
belongs to `platform-cbm-derive` rather than to an analysis.

### Where it lives, given the package family

A parallel effort has already split the modelling side by discipline into
`platform-cbm-geometry` (pure plan geometry, zero dependencies),
`platform-cbm-engine` (executes declarations it does not own),
`platform-cbm-derive` (the derived-edge passes) and `platform-cbm-ifc` (the
format profile). The analysis package joins that family as
`@aec-craft/platform-cbm-analysis` in `packages/cbm-analysis`.

Which answers the "structure it into graph and geometry" question by deleting
half of it: **geometry is already its own package.** `platform-cbm-geometry`
exists precisely because egress and distance needed the same primitives as the
footprint welder, so the analysis package depends on it rather than containing a
`geometry/` folder. Nothing in the analysis package computes a ring area.

```
packages/cbm-analysis/src
  core/          analysis.ts (defineAnalysis, the `needs` declaration), registry.ts, result.ts
  query/         the portable QuerySpec: spec, operand, measure, rows, run
                 dialect.ts, dialect.cypher.ts, dialect.sql.ts
  adapters/      rows.adapter.ts, traversal.adapter.ts   (geometry comes from cbm-geometry)
  analyses/      quantity/  indicator/  spatial/  quality/  compliance/
  index.ts
```

The package's own rule is that files stay flat and the domain lives in the
analysis id namespace, with a folder earned only once a category has several
files. At seven analyses that rule said no folders; at thirty, every namespace
above has earned one. The rule is unchanged, the count moved.

### What this does to the module cards

Worth stating outright, because the answer is "almost nothing changes". A card in
the demo is already a declarative reference to an analysis:

```ts
{ id: "net-floor-area", title: "Net floor area", analysis: "query",
  unit: "m²", size: "2x2",
  params: sumSpec("space", "envelope.areaNet", { groupBy: STOREY_GROUP }) }
```

Zero Cypher in the catalog, and the card already validates its params against the
named analysis's own schema. So the migration is one seam rather than a rewrite:
`ModuleContext.graphQuery` becomes `runAnalysis(id, params)` posting to the route,
the `QuerySpec` travels as the request body, and the server compiles it to SQL or
Cypher according to what the analysis declares it needs.

| Piece | Where it ends up |
| ----- | ---------------- |
| Card configs (`analysis` + `params`) | unchanged, client-side, persisted as today |
| `spec.builders.ts` | stays client-side: it is the builder UI's input, and its output is the request body |
| The registry's metadata | ships to the client for the card builder: ids, titles, params schemas, sizes |
| Compilation and execution | server, and the client never sees a query string again |
| `ModuleContext.graphQuery` | gone |
| `overlayOf` and `setOverlay` | unchanged: `AnalysisResult` already carries `overlay` and `nodeIds` over the wire |

Losing `graphQuery` is the part worth wanting. It is the client's ability to send
arbitrary Cypher, and the Cypher route has a known, accepted weakness: a scalar or
map projection defeats the post-filter scope check. Taking the app off that path
means the weakness stops being reachable from normal product use, and the endpoint
survives as the marked-experimental tool it was meant to be.

Two app-level queries are not cards and need their own treatment. Listing storeys
for the chip row is `GET /graph/nodes?class=eq.storey`, a plain list call rather
than an analysis; the HUD's node count is `quantity` with no filter. Neither needs
a traversal, which is the pattern in miniature.

The compliance payoff falls out for free: `compliance.summary` is a filter, a
group-by and a count over verdict rows, so the project rollup in view two is
literally a module card naming that analysis. No new surface, no new machinery,
and the same card the demo already renders.

### Not a new `*-api` package

The mount is one submodule inside `graph-api`, at `modules/graph/analyses/`,
sitting beside `modules/graph/query/` exactly as the Cypher route does today.

| | Library plus a graph-api submodule (chosen) | A `platform-graph-analysis-api` package |
| --- | --- | --- |
| Tables and migrations | none, it computes over graph-api's | none either, so it fails the test for being one |
| OpenAPI document | joins the graph document, where a caller looks for it | a second document for routes that read graph tables |
| Structure to mirror | one controller, one service | config, database module, nest entry, openapi, tests harness |
| Consumed by cbm-demo | yes, the definitions are framework-free | only through HTTP |

The repo's own test for an `*-api` package is that it owns its tables, its
migrations and its OpenAPI document. An analysis package owns none of the three,
so the overhead you suspected is real and buys nothing. The library stays pure
and framework-free, `graph-api` provides the adapters over its own services and
the routes, and the definitions still ship to the client for the parts a UI needs
(id, title, params schema, card size) while execution stays on the server, which
is also where the rule that only the server holds derived state puts it.

```
GET  /projects/:projectId/graph/analyses               list, filter by namespace
POST /projects/:projectId/graph/analyses/:analysisId   run, params validated by its own schema
```

Namespacing lives in the analysis id, which is what the existing ids already do,
so no nested route segments are needed. One move buys the HTTP routes, the MCP
tools, the agent tools that `PlatformRunGraphSource` currently carries a TODO
for, and the evaluator catalogue that a `measure.type: "analysis"` rule needs.
Cypher stays as the marked-experimental escape hatch.

## Binding: no edge crosses between the two graphs

There are two graphs here, and it is worth saying so plainly because it settles
several questions at once. Documents and the rules derived from them are one
graph: sources nest by `parentId`, `cites`, `amends` and `supersedes` run between
sources, and `modifies` runs rule to rule for a deviation or an exemption. The
building model is the other graph: objects nest by `parentId` with `bounds`,
`adjacentTo`, `connectsTo`, `serves` and the derived passes between them.

**Nothing connects the two.** The only join is the selector: a class matched
against a class, refined by predicates, evaluated into verdict rows. A verdict row
carries both ids plus a status an edge cannot hold, which saves roughly 60k edges
per storey-set and is already the model's decision.

### Which means `governs` should be removed, not kept for hand pinning

The model spec currently keeps `governs` alive for the one case a selector cannot
express: a person pinning an extra rule to a specific node. That should go, and
the reason is stronger than tidiness.

A verdict records `ruleVersion`, and the version is what makes a verdict
reproducible: same inputs, same rule version, same verdict, forever. An asserted
edge sitting outside the rule changes **who the rule applies to** without bumping
the rule's version, so two verdicts with the same `ruleVersion` can have been
produced by two different bindings. The spec's own pipeline table says a selector
edit rebinds that rule; an edge makes scope editable by a route that no version
number witnesses.

So the selector stays the single, versioned answer to who a rule applies to, and
a hand pin becomes part of it:

```jsonc
"selector": {
  "classes": ["space.kitchen"],
  "nodeIds": ["4e7c1a92-…"]        // an explicit pin, versioned with the rule
}
```

One thing to read, one thing to version, one thing to diff when the binder
rebinds. `modifies` is unaffected and must not be removed with it: rule to rule
is inside the rule graph, not across the boundary.

The timing argument matters more than the design one. Nothing has written a
`governs` row yet, so removing it now costs thirteen files, most of them test
fixtures and route descriptions. Removing it after a customer's estate carries
them is a migration. And the removal fails soft by construction: taking a value
out of the canonical list makes any existing row `experimental` drift rather than
an error, because that is what the open-vocabulary rule guarantees.

**Tasks this creates**, both of which belong in the same change as the rule blocks:

- `contracts`: delete `rule/edges/governs.edge.ts`, drop it from `RULE_EDGES`,
  add `selector.nodeIds`, and correct the `rule` node-type description, which
  currently reads "bound to targets via `governs`".
- `graph-api`: drop it from the projection's edge handling in `sync/cypher.ts`,
  from the MCP apply descriptor, and from the three test suites that assert on it.
- `docs/cognitive-building-model.md`: the Decisions table currently records
  "`governs` is asserted only" as settled with nothing that would reverse it. That
  row needs rewriting, since this is the thing that reverses it.

### What the alternatives cost

| Event | Verdict rows | `governs` edges | Read-time filter |
| --- | --- | --- | --- |
| A new node arrives | binder writes rows for every matching rule | a post-insert job must synthesise edges | nothing to do |
| A threshold is edited | re-evaluate existing rows | edges unchanged, verdicts nowhere | re-scan |
| A selector is edited | rebind that one rule | diff every edge | re-scan |
| "What is failing on this storey" | one indexed read | a join, then a full evaluation | a full evaluation per request |
| "What was true at submission" | the row, with its stamps | impossible | impossible |

The last row is why this is not a tuning choice. A stored verdict with
`ruleVersion`, `evaluatorVersion` and `computedFromSeq` is the only artefact that
can answer what was true when a submission was made.

## Re-running without losing anything

A run is versioned and additive. Extraction capability will improve (cross
references, overrides, the deferred expressiveness gaps), and a re-run has to
extend the result rather than replace it.

```
extraction_run        id, extraction_id, structure_version, status, formaliser,
                      model, prompt_version, taxonomy_version, started_at,
                      finished_at, counts
extraction_candidate  run_id, logical_path, disposition, gap_id, reason,
                      node_id, confidence, proposal, timestamps
```

A hand-authored rule simply has no candidate row, which is the same statement
`file_index` already makes by being absent for every file nobody indexed.

### The prefix names the aggregate root

The estate already has a convention, and reading it off the existing tables
settles both of the naming questions here:

| Package | Tables | Pattern |
| ------- | ------ | ------- |
| `tenancy-api` | `org`, `project` | roots, bare |
| `users-api` | `user` | roots, bare |
| `threads-api` | `thread`, `thread_message`, `thread_run` | root bare, children take its name |
| `files-api` | `file`, `file_upload`, `file_index`, `file_index_chunk` | same |
| `graph-api` | `graph_node`, `graph_edge`, `graph_version` | no root row exists, so the slice name stands in |

So: **an aggregate root is bare, everything hanging off it takes the root's name,
and where there is no root row the slice name stands in for one.** `graph_*` is
not an exception to the rule, it is the second half of it.

That gives four families and retires two names I had wrong:

- `extraction`, `extraction_unit`, `extraction_run`, `extraction_candidate` in
  `files-api`. Not `extraction`: with `file_id` nullable, an extraction is
  its own root rather than a child of `file`, and these are the names the model
  spec used before I deviated from them.
- `compliance_verdict` and `compliance_run` in `graph-api`.

Two things follow that are worth being explicit about.

**Not `extraction_run`.** A prefix names a root row, and there is no `rule` table.
There never will be, because a rule is a `graph_node`; that is the whole point of
rules being nodes with identity and version rather than rows in a rules table. So
`rule_*` would imply storage that deliberately does not exist. The nullable
column also moves: it belongs on `extraction.file_id`, because the thing that may
one day have no file is the *document* (a pasted text, a URL), while a run always
reads an extraction. Hand authoring creates no run at all.

**Not `graph_verdict`.** It would file a verdict with `graph_node`, `graph_edge`
and `graph_version`, which is exactly what it was designed not to be: rows, not
nodes, deliberately outside the version log because their volume tracks rules
times nodes and churns on every edit. `compliance_` is also the vocabulary the
rest of this design already speaks, in the mirrored `compliance` block and the
four `compliance.*` analyses.

`compliance_run` comes along for free and is worth having: a full revalidate pass
should record who triggered it, at what sequence, how long it took and what it
produced, exactly as `thread_run` does for a generation.

Four properties make a re-run safe:

- **Deterministic identity.** A proposed rule's node id is a uuidv5 over
  (`fileId`, `logicalPath`, rule key), so the second run upserts the same node
  instead of creating a twin.
- **Reviewed state is sacred.** A re-run only ever writes a node whose
  `lifecycle.status` is `draft`. A reviewed, edited or rejected rule is never
  touched; a materially different proposal for one is recorded on the candidate
  row and reported as a divergence for a person to resolve. Without this rule a
  capability improvement silently reverts every human correction.
- **Rejection is remembered.** A rejected rule keeps its node with
  `lifecycle.status: "rejected"` rather than being deleted, so the next run does
  not propose it again.
- **Every unit has a disposition.** Runs are comparable because both cover the
  same denominator.

### Coverage is a disposition per unit

Never a silent drop. One disposition per unit per run, an open vocabulary with a
canonical list:

| Disposition      | Means                                                                |
| ---------------- | -------------------------------------------------------------------- |
| `drafted`        | A draft rule was written                                              |
| `descriptive`    | Definitions, headings, scope statements; states no requirement         |
| `administrative` | Normative, but about process, fees, penalties or competence           |
| `qualitative`    | Normative, not machine-evaluable; a `judgement` measure candidate      |
| `deferred`       | Quantitative but blocked by a named gap, with its `gapId` (G3 to G12)  |
| `unresolved`     | Depends on a unit or a document this run could not resolve             |
| `failed`         | The model errored or returned something invalid                       |

Seven single lowercase words, which is what the enum convention asks for and what
the permits and standings vocabularies already do. Three of them replace compounds
and are worth the swap on their own terms: `descriptive` is the real opposite of
normative, `administrative` says what the text *is* rather than that we chose not
to want it, and `unresolved` names the state rather than the construct that caused
it. `drafted` is deliberately not `formalised`: it ties the disposition to the
`draft` lifecycle status it produces, and it has no British-versus-American
spelling fork, which matters when the value is written by a model.

Which turns the two lists a person wants into one query: what was extracted, and
what was not, with a reason per item rather than an absence. Cross references and
overrides land in `unresolved` and `deferred` from day one, so the first run
already tells you the size of the work it did not do.

## Two views, and they do not share a denominator

Worth separating hard, because the pull is to build one screen that does both
and it cannot.

| | Extraction view | Compliance view |
| --- | --- | --- |
| Asks | What did we get out of this document | Where does this building stand |
| Scope | one file | one project |
| Denominator | units of text | rule times object pairs |
| Reads | candidate rows plus the rules derived from that file | verdict rows and the mirrored summary |
| Changes when | a run finishes, or somebody reviews | the model changes, or a rule does |
| Uncertainty means | the extractor was unsure of the reading | the evaluator could not decide |

The last row matters more than it looks. A rule formalised at confidence 0.4 and
a verdict that came back `review` are both "unsure" about entirely different
things, and merging them into one warning state loses the only distinction a
person can act on: the first needs somebody to read a paragraph, the second needs
somebody to look at a model.

### View one: the extracted rules

A list per document, and the gate the model spec puts before mandatory
evaluation, so a usable version ships with the pipeline rather than after it.

Each row carries the rule's name and citation, the `provenance.quote` it was read
from, what it demands rendered in plain language from the criterion, the selector
it will bind by, and its confidence. Default sort is confidence ascending: the
queue should open on the drafts most likely to be wrong. Beside the list, the
coverage panel: counts by disposition, deferred items grouped by gap, unresolved
cross references, and any divergence a re-run produced.

| Action | Does                                                                 | Next run                                                    |
| ------ | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| accept | `lifecycle.status` to `active`; the binder picks it up                 | leaves it alone                                              |
| edit   | an ordinary node update, so the rule carries its own version history   | leaves it alone, reports a divergence if it would have differed |
| reject | keeps the node at `rejected`                                          | remembers, and does not propose it again                     |
| delete | removes the node                                                      | is free to propose it again                                  |

Reject is the default and delete is the escape hatch, because a rejection is a
judgement worth keeping and a deletion throws that judgement away. Authoring a
rule from nothing is the same form in create mode, which is why that deferred
item is small once edit exists rather than a project of its own.

`provenance.quote` stays denormalised on the rule deliberately: it is the excerpt
a person reviewed at a point in time and must not change when the segmenter
improves.

### View two: compliance

Everything here is one table read from three directions. A verdict row is keyed
by `(scenarioId, contextId, ruleId, nodeId)`, so both drill-downs are the same
rows under a different filter and the marker is their aggregate. An edge could
carry the two ids but not the status, the measured value or the stamps, so both
drill-downs would have to re-evaluate on every click. That is the third argument
against binding by edge.

- **The project rollup.** Counts by status, worst deviations, and the same
  figures per storey. An analysis (`quality.compliance`), so it mounts as a
  route, a tool and a module card like every other computation.
- **Object drill-down.** Every rule bound to this node, its status, the measured
  value against the expected one, which case applied, and the citation to jump
  back to the source text.
- **Rule drill-down.** Every object this rule was checked against, split by
  status, failures first. It returns node ids, which is what the viewer's
  existing overlay path already consumes, so clicking a rule highlights its
  objects with no new plumbing.
- **The marker.** Drawn from the mirrored `compliance` block on the node. One
  read, no join.

Two things a person will look for and should find rather than infer: a rule that
bound to nothing at all, which is a gap in the model and not a pass, and a
verdict standing behind the log head, which renders as stale with its last known
value rather than quietly as current.

The trigger for a run belongs in the file browser, which today has no extension
point; `FileActions` is a closed list. The SDK's `<FileBrowser>` gains an action
slot so a host mounts "Extract rules" on a document, rather than the browser
learning what a rule is.

## The check engine

Bind then evaluate, both server-side, because only the server holds current model
state and only the server writes derived state.

Now: one button. A full pass marks every scope dirty and runs the binder and the
evaluators over the project. That is not a stopgap, it is the same code path the
incremental loop uses, which is what makes derived state disposable rather than
merely described as disposable.

Later, unchanged in shape: the change spine's typed envelope carries
`changedPaths`, an invalidation worker inverts stored verdict inputs into a
dependency index, and a property write rebinds one rule for one node. Verdict
inputs must be recorded from the first evaluation even while nothing consumes
them, because the dependency index is an inversion of data that has to already
exist. The cascade is bounded at depth 3, and `bias to over-invalidation` decides
every granularity question: over-invalidating costs time, under-invalidating
ships a false pass.

### The client pulls, and the server never pushes state

Worth being precise about the client contract, because it is simpler than the
internal one and the two get conflated. The recompute is entirely server-side: a
rule is accepted or a threshold is edited, and the binder and the evaluators
settle it before any client is involved. So the client needs no event-driven
recompute of its own and no merge logic. It needs one thing: to be told that what
it holds is stale, and to pull.

The signal carries invalidation keys and a sequence number, never values:

```jsonc
{ "scope": "project:…", "seq": 41207,
  "invalidate": ["verdicts:project", "verdicts:node:4e7c…", "rules"] }
```

Three properties make this the right shape rather than merely the easy one.

- **A missed message costs latency, not correctness.** A dropped notification
  leaves a stale view until the next one or until the refetch floor, and the pull
  is idempotent. A pushed delta that goes missing leaves a client silently wrong,
  and it has to be ordered per client to avoid that.
- **The change feed makes no authorization decision.** A push carrying data must
  be authorized at fan-out time, per subscriber, against a scope that may have
  changed since they subscribed. A notification naming a scope reveals almost
  nothing, and the pull is authorized by the same guard as every other read. Where
  a denial and a missing row deliberately look identical, that is the difference
  between one guard and two.
- **`seq` is what makes staleness displayable.** A client can tell whether the
  response it just received already includes the change it was told about, which
  is what stops a refetch loop and what lets the viewer draw a marker as
  stale-with-last-known-value rather than confidently current.

Which is much closer to a collaboration layer than to an event bus, and it is
what the spec's transport tiers already describe from the other side: tier one is
in-process consumers over cursors with SSE fan-out from the same process, and the
subscriptions consumer carries a p95 under 500 ms. The invalidation worker and the
dependency index stay internal. They are how the server decides *what* to
recompute, and no client ever sees them.

### The indicator

On the colours: the ask was red, amber, green, grey. Recommend against three
accents. Compliance is the one place the design language spends its accent, so
`fail` takes destructive and everything else is carried by weight and opacity:
`review` and `skip` as a muted marker, `pass` as quiet or unmarked, `error` and
`stale` as grey with the last known value shown rather than hidden. A model where
every object is painted green reads as approval, which is the failure mode a
compliance product cannot afford.

## Sequencing

Stacked, each shippable on its own.

| # | Lands                                                                                                   | Depends on |
| - | ------------------------------------------------------------------------------------------------------- | ---------- |
| 1 | `contracts`: the four rule blocks with `selector.nodeIds`, the source `citation` / `anchor` / `publication` blocks, the operator vocabulary and the path grammar as types, a space leaf set for `CANONICAL_CLASSES`, and the removal of `governs` | none |
| 2 | `graph-api`: `GET /graph/taxonomy`, advisory rule-block validation with drift counting on write, and `governs` out of the projection, the MCP descriptor and the suites | 1 |
| 3 | `platform-analysis`: the analysis package moves in, `quality.census` arrives, `/graph/analyses` mounts, MCP and agent tools bind | none |
| 4 | `files-api`: structuring. `extraction` and `extraction_unit`, the `DocumentStructurer` port with its anchor-and-slice contract, structure versioning, submit / state / units routes, the table-of-contents gate | none |
| 5 | `files-api` and host: extraction. `extraction_run`, `extraction_candidate`, the `RuleFormaliser` and `RuleGraphSink` ports, the worker, the coverage route | 1, 3, 4 |
| 6 | `sdk`: extraction, taxonomy and analysis clients and hooks; the `<FileBrowser>` action slot                | 2, 3, 5 |
| 7 | the extraction view: the rules list with accept, edit, reject and delete, and the coverage panel beside it | 6 |
| 8 | `graph-api`: the binder, `compliance_verdict` and `compliance_run`, the two verdict reads (by node, by rule), the `compliance` mirror, a full revalidate pass, the `path` / `expression` / `relation` / `aggregate` evaluators | 1, 3 |
| 9 | the compliance view: the project rollup, both drill-downs, the marker in the viewer, the rule-to-objects highlight over the existing overlay path | 8 |

## Deferred, and tracked

Each of these is a GitHub issue rather than a paragraph here, because the code
will want a one-line pointer to it.

- Cross-reference resolution: `unresolved` dispositions become `cites` edges
  between source nodes, and referenced thresholds become `constraints[].valueFrom`
  (gap G12).
- Incremental recompute: the dependency index and the invalidation worker, which
  is the P2 row and has consumers beyond this pipeline.
- Amendment flow: a re-upload of a revised statute supersedes units, moves the
  rules derived from them to `inReview`, and stales their verdicts.
- Rule authoring beyond accept / edit / reject: a person creating a project rule
  from nothing.
- The expressiveness gaps as the corpus demands them, `measure.method` (G10)
  first, because it is the only one that produces a confident wrong answer rather
  than a visible hole.
- `judgement` measures: the queue that keeps a qualitative rule counted instead
  of dropped.

## Where this is allowed to be wrong

Structuring must not be wrong, because it fails silently, it is the one stage
with a model in it that no later stage can catch, and every downstream number is
denominated in its output. That is what the table-of-contents gate and the
anchor-match check are for. Extraction is expected to be wrong, near one in four
on current benchmarks, which is why nothing mandatory evaluates from an
unreviewed rule. Binding may be wrong visibly: a rule that binds to nothing is
a counted gap, not a pass. Evaluation may not be wrong at all, and it is the only
stage with no model in it.

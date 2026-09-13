# cbm-engine

Builds a cognitive building model out of whatever a format profile declares.

The engine's whole job is to **execute declarations it does not own**. Mapping
tables come from a format profile. Nothing here knows what IFC is, what a
footprint is, or what a stairwell is.

If you are adding knowledge about a format, you are in the wrong package. This
one only grows when the *machinery* needs to.

## The three stages

```
instances ──map──▶ working graph ──▶ changeset
```

A caller that wants to enrich the graph in between does it themselves: map,
mutate the `WorkingGraph`, serialise. The engine ships no enrichment and has no
opinion on what it would be.

| Stage | Where | What it does |
| --- | --- | --- |
| map | `map/` | Source instances to nodes and edges, using the profile's table |
| serialise | `core/changeset.ts` | One idempotent changeset. The only exit point |

`build()` is the one function that says those happen in that order. Everything
else is usable on its own.

## The two ideas worth knowing

**Every id is derived, never allocated.** `core/id.ts` takes uuidv5 over scope,
format and the source's own id. Re-importing the same file produces the same
ids, so a changeset is an upsert with no lookup table and no import history.
It is also what lets a re-import pick up improved mapping rules without
orphaning what the last one made. The namespace constant must never change.

**The working graph is the only materialisation.** Map writes the node objects,
passes mutate them in place, and the changeset serialises the same objects.
There is no copy, so an enriched node *is* the uploaded node. `Graph` indexes
adjacency per endpoint and per type, because passes read typed edges inside
per-node loops and filtering there is what dominates a large run.

## Unmapped is drift, not failure

An instance no entry claims is counted and skipped. An unknown type is
something the source did, not something the import got wrong, and the honest
response is a number in the report rather than an exception. Coverage names
which types.

## What is deliberately not here

| | Lives in |
| --- | --- |
| Anything about a file format | a format profile, e.g. `cbm-ifc` |
| The vocabulary itself: classes, blocks, edge types | `platform-contracts` |
| Inference passes, and anything geometric | a host that has them |

Two of those are worth stating plainly.

The `cbm-*` packages produce the model; they do not define it. The definition is
a wire contract every client reads, so it lives with the other contracts.

And the pass machinery is here while no passes are. That is the extension point:
`build()` takes whatever passes it is handed, `PassContext` is deliberately an
open record, and a host that wants adjacency or connectivity brings its own.
The engine having an opinion about inference is the thing this arrangement is
designed to prevent.

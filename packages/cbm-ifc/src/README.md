# cbm-ifc

IFC as a cognitive building model.

## Read this first: IFC is ten mechanisms, not 850 entities

The official documentation is an alphabetical list of around 850 entity types,
which is why IFC has a reputation for being impenetrable. It is not. It is a
small number of **mechanisms** and a large vocabulary slotted into them.

Learn the mechanisms and the vocabulary is just lookup.

```
decomposition   IfcProject › IfcSite › IfcBuilding › IfcBuildingStorey › IfcSpace
containment     IfcRelContainedInSpatialStructure          → contains
voiding         IfcWall ‹voided by› IfcOpeningElement ‹filled by› IfcDoor → hostedIn
boundaries      IfcRelSpaceBoundary                        → bounds
properties      IfcRelDefinesByProperties › IfcPropertySet → envelope, material, …
quantities      IfcElementQuantity                         → envelope.areaNet
systems         IfcRelServicesBuildings                    → serves
units           IfcUnitAssignment                          → the scale on every number
geometry        shape representations                      → not read at all
```

That is the whole format for our purposes.

## One folder per mechanism

Every folder has the same three files, so once you have read one you can
navigate all of them:

| | |
| --- | --- |
| `README.md` | what IFC states, what we make of it, what we drop |
| `mapping.ts` | the entries, and nothing else |
| `mapping.test.ts` | the behaviour the README claims |

Folders that also read the STEP text add `scan.ts`, and folders that build
instances the file does not contain add `synthesize.ts`.

| Folder | Produces | |
| --- | --- | --- |
| `spatial-structure/` | `site`, `building`, `storey`, `space` | 5 |
| `architecture/` | `element.wall`, `.door`, `.slab`, … | 18 |
| `structure/` | `element.column`, `.beam`, `.footing`, … | 5 |
| `services/` | `element.duct.*`, `.pipe.*`, … and `serves` | 23 |
| `furnishing/` | `element.furniture` | 2 |
| `containment/` | `contains` | 2 |
| `space-boundaries/` | `bounds` | 2 |
| `openings/` | `hostedIn`, and virtual connectors | 2 |
| `properties/` | `envelope`, `material`, `programme`, `systems` | 80 rules |
| `units/` | the factors every number passes through | |
| `read/` | Node only: the WASM kernel lives here and nowhere else | |
| `catalog/` | denominators, mostly generated | |

## What a dot in a class means

**Is a kind of.** `element.wall.curtain` is a wall, so a query for walls finds
it, and a query for exactly `element.wall` does not.

Parts are not spelled with a dot. A stair flight is `element.stairFlight` and
belongs to its stair through an edge, because a part is a relationship. If the
dot meant both, a query for stairs would count every flight as another stair and
neither reading would be safe.

Compound nouns stay camelCase: `curtainWall` was wrong for a different reason,
but `shadingDevice`, `airTerminalBox` and `sanitaryTerminal` are single things
with two-word names, not kinds of device, terminal or box.

## What is not mapped yet

Six of the 61 `IfcRel*` types are mapped. That denominator flatters and damns at
once: six of the 61 are abstract supertypes no file instantiates, two more are
mechanisms consumed elsewhere (`IfcRelDefinesByProperties` in `properties/`,
`IfcRelVoidsElement` in `openings/`), and `IfcRelaxation` is not a relationship
at all, just a name collision.

The gaps worth closing, in rough order of value. Most need no new edge type:

| Missing | Would feed | Why it matters |
| --- | --- | --- |
| `IfcRelDefinesByType` | `properties/` | A door whose fire rating sits on its type has no fire rating today. Very common |
| `IfcRelAssociatesMaterial` | the `material` block | The block exists and only its performance half is fed |
| `IfcRelReferencedInSpatialStructure` | `contains` | Elements spanning storeys currently have no container |
| `IfcRelNests` | `contains` | IFC4's ordered aggregation |
| `IfcRelCoversBldgElements`, `IfcRelCoversSpaces` | new edge | Coverings are nodes, but nothing says what they cover |
| `IfcRelConnectsElements` | new edge | Element-to-element structure; the load path |
| `IfcRelConnectsPortToElement`, `IfcRelConnectsPorts` | new edge | MEP network topology; see `services/` |
| `IfcRelAssignsToGroup` | `serves` | System and zone membership |
| `IfcRelAssociatesClassification` | a block | Uniclass, OmniClass codes |
| `IfcRelInterferesElements` | new edge | Clashes the author already declared |

Deliberately out of scope for now: the scheduling and cost family
(`IfcRelSequence`, `IfcRelAssignsToProcess`, `IfcRelAssignsToResource`,
`IfcRelSchedulesCostItems`) and the structural analysis family.

One edge type in the vocabulary, `interfaceOf`, is fed by nothing here at all.

## The three things that surprise everyone

**IFC never says a door is in a wall.** It says the wall is voided by an
opening and that the opening is filled by the door. Two relationships, one
fact, and the fact itself written nowhere. See `openings/`.

**Length, area and volume can have different units in one file.** Exports
commonly write lengths in millimetres and areas already in m². Deriving area
from length by squaring is wrong wherever that happens. See `units/`.

**A space knows nothing about the walls around it.** Only the boundary relation
joins them, and without it you have a bag of rooms and a bag of walls. See
`space-boundaries/`.

## Where to start reading

1. This file.
2. `openings/README.md`, the hardest mechanism and the most surprising.
3. `properties/README.md`, where the real gap is.
4. Anything else, when you need it.

## Semantics only. No geometry, on purpose

This package reads what a file *says*: entities, the relationships between them,
property sets, quantities, units. It never streams a mesh, computes a footprint
or measures anything, and it has no dependency that could.

That is a deliberate boundary, not a gap. Deriving real geometry from meshes is
a discipline of its own and a proper engine does it properly; a hand-rolled
outline welder living here would be something to maintain until that arrives and
then delete. A host that has geometry (a viewer, a geometry service) matches an
element to it through `localId`, which is carried for exactly that reason.

What follows from it: no bounding boxes, no centroids, no footprints, and no
inference that would need them. Adjacency and connectivity are still available
to a host that runs its own passes, because both are read off `bounds` edges and
need no geometry at all.

## What is deliberately elsewhere

| | |
| --- | --- |
| Mapping machinery, ids, the changeset | `cbm-engine` |
| The vocabulary this maps into | `platform-contracts` |
| Anything geometric | not in this repo yet, and not this package's job |

This package holds **knowledge about IFC**. Anything that would be equally true
of another format belongs in the engine; anything about where things are in
space belongs to whatever does geometry.

## Coverage, honestly

`pnpm coverage` reports it, measured against the schema itself:

- **58 of 296 mappable entity types**, 20%. The denominator is computed from
  web-ifc's own schema, so it is the real one.
- **74 of 226 standard properties**, 33%. **This one is not trustworthy.** The
  denominator is a curated subset written by hand, not the real standard.
  buildingSMART publishes 513 property-set definitions for this schema version
  in `buildingSMART/IFC4.x-development`; measured against those, the true figure
  is low single digits. Generating that denominator is the outstanding job, and
  `catalog/README.md` says where it comes from.

Coverage is measured against the standard, never against an example file. What
share of one model happens to map is a property of that model, and quoting it
would flatter or damn the mapping arbitrarily.

Properties are the work. Both the rules and the denominator need to grow, and
the denominator growing will make the number fall, which is correct.

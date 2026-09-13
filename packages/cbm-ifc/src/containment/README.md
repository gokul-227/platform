# Containment

**IFC calls this** aggregation and spatial containment. **We call it** the
`contains` edge.

## Why this exists

Without it the spatial structure is a pile of nodes. This is what makes the
site hold the building, the building hold the storeys, and the storeys hold
everything else, which is what "per floor" and "what is in this room" both
walk.

## What it does

Both IFC relationships become `contains`, pointing from container to contained.

IFC splits the idea in two, and the split is real to IFC but not to us:

- **`IfcRelAggregates`** builds the spatial tree. Site aggregates building,
  building aggregates storeys. Also used for a stair aggregating its flights.
- **`IfcRelContainedInSpatialStructure`** puts a physical element on a storey.

Nothing downstream benefits from telling them apart, so they collapse. The
distinction survives in `interop.sourceClass` if it is ever wanted.

## IFC types here

| IFC | | Ours | Endpoints |
| --- | --- | --- | --- |
| `IfcRelAggregates` | → | `contains` | `RelatingObject` → `RelatedObjects` |
| `IfcRelContainedInSpatialStructure` | → | `contains` | `RelatingStructure` → `RelatedElements` |

Note the direction. Both read container first, which is what makes `contains`
mean the same thing whichever relationship produced it.

## What it deliberately does not do

**Repair a missing tree.** Exports frequently place elements on storeys and
never say the storey is in the building, leaving a tree with no trunk. Fixing
that is inference, not reading, so it belongs in a pass a host runs rather than
here. Repaired edges should be tagged so they stay distinguishable from these.

**Decide anything when an endpoint is missing.** An edge whose endpoints are
not both mapped is dropped by the engine, because a changeset with a dangling
endpoint fails as a whole.

## Coverage

2 of the 61 relationship types, and the two that carry the spatial tree.

`IfcRelReferencedInSpatialStructure` is the notable absence, and it belongs
here. An element that spans storeys (a column through floors, a curtain wall, a
shaft) is *referenced* in each rather than *contained* in one, so today those
elements have no container at all. It would feed the same `contains` edge, so
closing it needs no new vocabulary.

`IfcRelNests` is the other, IFC4's ordered aggregation. Also `contains`.

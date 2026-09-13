# Space boundaries

**IFC calls this** `IfcRelSpaceBoundary`. **We call it** the `bounds` edge.

## Why this exists

A space in IFC knows nothing about the walls around it. The boundary relation
is the only place the file states which element encloses which space, and
almost everything interesting is downstream of that fact: adjacency, whether
you can walk between two rooms, egress, clash.

Lose this and you have a bag of rooms and a bag of walls with nothing joining
them.

## What it does

One `bounds` edge per boundary, element to space.

Both levels of boundary map to the same edge. Second-level boundaries split a
wall into a piece per adjacent space, which is richer than first-level, but for
"which element encloses which space" they say the same thing.

## IFC types here

| IFC | | Ours | Endpoints |
| --- | --- | --- | --- |
| `IfcRelSpaceBoundary` | → | `bounds` | `RelatedBuildingElement` → `RelatingSpace` |
| `IfcRelSpaceBoundary2ndLevel` | → | `bounds` | same |

## Virtual boundaries are not edges

A boundary can be **virtual**: two spaces are open to each other with nothing
between them. There is no element, so there is nothing for an edge to point at.

Those are not dropped. The reader collects the spaces carrying one and passes
them to the derive stage as `virtualBoundarySpaces`, and `topology.openPlan`
pairs them geometrically instead. This is the one place format knowledge
travels past the mapping, and it does so as data rather than as a rule.

## What it deliberately does not do

**Adjacency.** Two spaces sharing a bounding element are adjacent, but that is
derived from these edges, not read. `topology.adjacentTo` does it.

**Connectivity.** A shared wall is not a door. Keeping `bounds` free of any
passability judgement is what lets `topology.connectsTo` make it.

## Coverage

2 of the 61 relationship types in the schema, and the only two that state
which element encloses which space.

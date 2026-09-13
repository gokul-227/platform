# Architecture

**IFC calls these** building elements. **We call them** `element.*`.

## Why this exists

These are the things a person points at. Walls, doors, windows, floors, stairs.
Almost every question about a building resolves to one of them eventually.

## What it does

One node per element, class by type. There is no cleverness here and there
should not be: a wall is a wall. The file is a lookup table so the four entries
that *do* carry a decision are visible among the ones that do not.

The decisions:

- **`IfcCurtainWall` is `element.wall.curtain`.** A curtain wall is
  non-load-bearing and usually glazed, but it encloses space and a query for
  walls should find it. The dot means "is a kind of".
- **A stair flight is `element.stairFlight`, not `element.stair.flight`.** A
  flight is a *part* of a stair, and a part is a relationship, so it belongs on
  an edge. If the dot meant both kind-of and part-of, a query for stairs would
  count every flight as another stair.
- **`IfcWall` and `IfcWallStandardCase` are both `element.wall`.** They differ
  only in whether the profile is swept along a path, which nothing downstream
  cares about. The original type is kept in `interop.sourceClass`, so this
  loses nothing.
- **`IfcBuildingElementProxy` maps to `element.proxy`.** It is the catch-all an
  authoring tool reaches for when nothing fits. Keeping it means the element
  exists in the graph; the class says honestly that we know nothing about it.
- **`IfcVirtualElement` is not in any IFC file.** The reader synthesises them
  for doorless thresholds. See `openings/`.


## IFC types here

| IFC | | Ours |
| --- | --- | --- |
| `IfcWall`, `IfcWallStandardCase` | → | `element.wall` |
| `IfcSlab`, `IfcRoof` | → | `element.slab`, `element.roof` |
| `IfcDoor`, `IfcWindow` | → | `element.door`, `element.window` |
| `IfcCurtainWall` | → | `element.wall.curtain` |
| `IfcCovering`, `IfcPlate` | → | `element.covering`, `element.plate` |
| `IfcStair`, `IfcStairFlight` | → | `element.stair`, `element.stairFlight` |
| `IfcRamp`, `IfcRampFlight`, `IfcRailing` | → | `element.ramp`, `element.rampFlight`, `element.railing` |
| `IfcChimney`, `IfcShadingDevice` | → | `element.chimney`, `element.shadingDevice` |
| `IfcBuildingElementProxy` | → | `element.proxy` (we know nothing) |
| `IfcVirtualElement` | → | `element.virtual` (synthesised, never read) |

## What it deliberately does not do

**Any property beyond the name.** Everything else an element carries arrives
through `properties/`, because the same property means the same thing on twenty
element types and writing it twenty times is how mapping tables rot.

**Structural members.** Columns and beams are in `structure/`, not because IFC
separates them but because the questions asked of them are different.

## Coverage

18 of the 226 element types in the schema. Low against the whole element
universe, which is mostly types no architectural model contains, and the reason
the aggregate number in the entry README needs reading carefully.

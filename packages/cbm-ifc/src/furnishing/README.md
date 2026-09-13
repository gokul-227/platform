# Furnishing

**IFC calls these** furnishing elements. **We call them** `element.furnishing`
and `element.furniture`.

## Why this exists as its own folder

Two entries hardly need a folder, but they need somewhere they are not
confusing, and they are confusing in `architecture/`. Furniture is not fabric:
it does not enclose, does not carry load, and does not bound a space.

It also has a real effect elsewhere. Furniture is voided constantly, by cabinet
cutouts and sink holes, and those voids are not thresholds. `openings/` has to
know to ignore them, and this is where "furnishing is different" is written
down.

## What it does

One node each, marked `stub`: identity and a name, nothing more.

## IFC types here

| IFC | | Ours | |
| --- | --- | --- | --- |
| `IfcFurnishingElement` | → | `element.furnishing` | stub |
| `IfcFurniture` | → | `element.furniture` | stub |

## What it deliberately does not do

**Anything with the furniture.** No dimensions, no manufacturer, no asset data,
even though exports commonly carry plenty. Nothing consumes it, so mapping it
would be inventing a contract to maintain.

`stub` is the honest status for that: the node exists, and we make no claim
about it.

## Coverage

2 entries, both stubs.

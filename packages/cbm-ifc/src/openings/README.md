# Openings

**IFC calls this** voiding and filling. **We call it** the `hostedIn` edge.

## Why this exists

IFC never says "this door is in this wall".

It says the wall is voided by an opening, and separately that the opening is
filled by the door. Two relationships, one fact, and the fact itself is written
down nowhere. Composing them is the entire job of this folder, and it is the
single most surprising thing about reading IFC.

## What it does

Joins `IfcRelVoidsElement` and `IfcRelFillsElement` on the opening they share,
and produces one `hostedIn` edge from the filler to the host. Openings
themselves never become nodes: an opening is a hole, not a thing, and importing
them would have put hundreds of holes in the graph of one building.

## Doorless thresholds

What is left over matters as much. An opening that voids a wall and that
*nothing* fills is a hole you can walk through: an archway, a pass-through, a
missing door.

There is no element to represent it, so we invent one. Where the host wall
separates exactly two spaces, we synthesise a passable `IfcVirtualElement` and
bound both spaces to it, which gives `topology.connectsTo` something to join
them through.

Where the wall separates **more than two** spaces we stop and count it as
ambiguous. Which two rooms the hole joins is a geometric question this mechanism
cannot answer, and guessing would connect rooms that are not connected. A
missing edge is recoverable; a wrong one is not.

Cutouts in furniture are ignored outright. A sink hole is not a threshold.

## IFC types here

| IFC | | Ours |
| --- | --- | --- |
| `IfcRelVoidsElement` | + | composed, never mapped alone |
| `IfcRelFillsElement` | = | `hostedIn` edge, filler → host |
| `IfcOpeningElement` | → | **ignored on purpose**, see above |
| unfilled opening | → | synthesised `element.virtual` + two `bounds` |

## What it deliberately does not do

**Resolving ambiguous openings.** That needs the geometry of the hole against
the footprints of the candidate rooms. It belongs in a derive pass, not here.

**Open-plan pairing.** Spaces open to each other with no opening at all are
`space-boundaries/` plus `topology.openPlan`.

## Coverage

1 of the 61 relationship types, plus one entity deliberately ignored.

Unfilled openings are reported per read rather than counted here, in four
buckets: connected, ambiguous, exterior and furnishing. Ambiguous is the
recoverable one, and it is a property of the file rather than of this mapping.

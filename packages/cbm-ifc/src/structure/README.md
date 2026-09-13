# Structure

**IFC calls these** building elements too. **We call them** `element.*`.

## Why this exists as a separate folder

IFC does not separate structure from architecture; both are building elements.
We do, because the questions are different. Nobody asks the load path of a
door, and nobody asks the fire rating of a pile.

Splitting them costs nothing (the mapping shape is identical) and means the
folder you open matches the question you arrived with.

## What it does

One node per member, class by type. Same shape as `architecture/`, deliberately.

## IFC types here

| IFC | | Ours |
| --- | --- | --- |
| `IfcColumn` | → | `element.column` |
| `IfcBeam` | → | `element.beam` |
| `IfcMember` | → | `element.member` |
| `IfcFooting` | → | `element.footing` |
| `IfcPile` | → | `element.pile` |

`IfcMember` is the generic one: a brace, a mullion, a truss chord. On a real
model it is often the most numerous type here, which usually means a curtain
wall was exploded into its members.

## What it deliberately does not do

**Structural analysis.** IFC has a whole parallel world for it
(`IfcStructuralMember`, `IfcStructuralConnection`, load cases, results). None
of it is mapped, because nothing consumes it yet and a mapping nothing reads is
a claim we would have to keep true.

**Load-bearing status.** `Pset_*Common.LoadBearing` is a property, so it comes
through `properties/` like every other one.

## Coverage

5 entries. The gap is the structural-analysis world above, which is a decision
rather than an omission.

# Properties

**IFC calls this** `IfcRelDefinesByProperties`. **We call it** the blocks:
`envelope`, `material`, `programme`, `systems`.

## Why this exists

Entities tell you what things are. Properties tell you anything about them. A
wall with no properties is a wall you can count and nothing else.

This is also where the widest gap is. The entity side maps most of what a
building model is made of; the property side reads a third of even a curated
subset of the standard sets, and a smaller fraction of the full definitions.

## What it does

Rules keyed by a source address, applied to any instance carrying that
property whatever its type. Cross-cutting on purpose: `IsExternal` means the
same thing on eight entity types, so it is written once per target and spread
over the sets that carry it.

A rule that finds nothing does nothing, so listing one costs nothing.

## Organised by what it writes, not by what it reads

| File | Writes | |
| --- | --- | --- |
| `common.ts` | `programme.access`, `material.performance.*`, `systems.structural.*` | the `Pset_*Common` layer |
| `programme.ts` | `programme.use`, `programme.occupancy*` | what a space is for |
| `quantities.ts` | `envelope.*` | the `Qto_*BaseQuantities` layer |
| `vendor.ts` | `envelope.*` | authoring-tool sets, outside the standard |

Reading the same target from many sources is normal here. `envelope.areaNet` is
fed by eight different quantity sets, because IFC says "net area" in eight
different words depending on what you are measuring.

## Order matters

Vendor rules run **first**, so the standard rules that follow overwrite them
wherever a file carries both. A file with proper base quantities is never
degraded by also carrying an authoring tool's own sets.

## The vendor rules are not a footnote

Six rules against 74 standard ones. An export written without base quantities
has its dimensions **only** in the authoring tool's own sets, so where that
happens these six are the sole source of envelope numbers. `PSet_Revit_*` is
the namespace we carry rules for today; other exporters have their own.

They are excluded from standard coverage, deliberately: counting them against
the buildingSMART denominator would inflate a number that is supposed to
measure standards conformance.

## What it deliberately does not do

**Type properties.** `IfcRelDefinesByType` puts properties on a type that every
instance inherits. Not read, so a door whose fire rating is on its type has no
fire rating here. That is a known gap and a common one.

**Materials.** `IfcRelAssociatesMaterial` and the layer sets are unmapped, so
`material.performance.*` is populated while `material` itself is not.

## Coverage

80 rules: 74 standard, 6 vendor. That is 74 of the 226 properties in the
denominator, or 33%.

Read it as provisional. The denominator is a curated subset of the common
standard property sets, not the full buildingSMART definitions, so the real
figure against the whole standard is lower. See `catalog/README.md`.

The vendor rules are excluded from it deliberately: counting a vendor pset
against a buildingSMART denominator would inflate a number that is supposed to
measure conformance to the standard.

# Spatial structure

**IFC calls this** the spatial structure. **We call it** `site`, `building`,
`storey`, `space`.

## Why this exists

Every other mechanism hangs off this one. An element is only meaningful once
you know which room it is in and which floor that is on, and "per storey" is
the single most common thing anyone asks a building model.

## What it does

One node per spatial entity, near enough one to one. The only judgement is
`IfcSpace`, whose class is decided per instance by `classifySpace` reading the
room's name: IFC has one type for every room in the world, so kitchen versus
bedroom is in the text or nowhere.

`IfcProject` is not here. It is the file's root, not a thing in the building,
and it maps to the scope the import runs in.

## IFC types here

| IFC | | Ours | |
| --- | --- | --- | --- |
| `IfcSite` | → | `site` | full |
| `IfcBuilding` | → | `building` | full |
| `IfcBuildingStorey` | → | `storey`, with its stated `Elevation` | full |
| `IfcSpace` | → | `space.*` via `classifySpace` | full |
| `IfcSpatialZone` | → | `space.zone` | partial |

A storey's floor level is read from its own `Elevation` attribute rather than
inferred. The model author set that number; guessing it from geometry would be
worse and, since this package reads no geometry, impossible.

## What it deliberately does not do

**Nesting.** This turns entities into nodes and nothing more. Site containing
building containing storey is a relationship, and it lives in `containment/`.

**Naming the use of a space.** `classifySpace` picks a typological leaf
(`space.residential.kitchen`). What the room is *for* belongs in
`programme.use`, because a change of use must not re-classify the node.

## Coverage

5 of 9 spatial types. The missing four are the external and abstract
supertypes, which real files do not instantiate.

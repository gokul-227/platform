# Units

**IFC calls this** `IfcUnitAssignment`. **We call it** the factors every number
passes through.

## Why this exists

Nothing else in this package is allowed to know what units a file is in. Rules
declare the unit they want (`unit: "m2"`) and the adapter applies these
factors, so no mapping rule anywhere contains the word "millimetre".

## What it does

Reads the unit assignment from the file header and produces one factor per
measure. Handles SI prefixes and conversion-based units, so an imperial file
converts through the foot-to-metre factor it declares.

## The thing that surprises people

**Length, area and volume routinely disagree inside one file.** Exports
commonly write lengths in millimetres while areas and volumes are already m²
and m³. One scale factor cannot express that, which is why there are three.
Deriving area from length by squaring is wrong wherever that happens.

## IFC types here

| IFC | | Ours |
| --- | --- | --- |
| `IfcUnitAssignment` | → | the factor set |
| `IfcSIUnit` | → | prefix factor, e.g. `.MILLI.` is 1e-3 |
| `IfcConversionBasedUnit` + `IfcMeasureWithUnit` | → | declared factor, e.g. foot is 0.3048 |

## What it deliberately does not do

Angles, mass, time, currency. Nothing maps them yet, and a factor nothing reads
is a maintenance cost with no reader.

It also does not guess. No assignment means null and the caller assumes SI,
because applying a wrong factor turns a 4 m room into a 4 mm one and nothing
downstream can tell that happened.

## Read from text, not from the kernel

This parses the header characters rather than asking web-ifc, because the
kernel normalises geometry to metres but leaves property and quantity values
exactly as written. Those values are what this is for.

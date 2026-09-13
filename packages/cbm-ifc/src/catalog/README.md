# catalog

The property denominator coverage is measured against. Not mapping; just a
yardstick.

## Why only properties

The entity denominator used to live here as a generated file of every IFC type.
It is gone. It served two call sites that nothing invoked, one that only needed
the types we actually map, and one that can ask the kernel directly. A thousand
committed lines and a generator script to keep them fresh, for that.

What replaced it:

| Was | Now |
| --- | --- |
| casing table from every IFC type | built from the mapping table's own entries |
| "which types to materialise" | asked of the kernel at read time |
| coverage denominator | computed by the coverage script, which runs in Node |
| `readType`, `catalog()` on the adapter | deleted; nothing called either |

## The property list is hand-kept, and should not stay that way

`property.standard.ts` is a curated subset of the common `Pset_*Common` and
`Qto_*BaseQuantities` families, written by hand.

There is a real source for it. buildingSMART publishes the property set
definitions as XML, one file per set:

```
buildingSMART/IFC4.x-development
  reference_schemas/psd_IFC4_ADD2_TC1/   513 files, the version this maps
  reference_schemas/psd_IFC2x3/          and the same for other versions
```

513 sets against our curated subset, so **the reported percentage is
substantially overstated**. 74 of 226 reads as 33%; against the real definitions
the denominator is thousands of properties and the true figure is low single
digits.

Generating it is the fix, and it is not done here for one reason only: nobody
has needed the honest number badly enough yet. When someone does, that directory
is where it comes from, and the coverage figure will drop hard, which is the
correct direction for an honest denominator to move.

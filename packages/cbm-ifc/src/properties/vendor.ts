import type { FieldRule } from "@aec-craft/platform-cbm-engine";

/**
 * Authoring-tool property sets, outside the buildingSMART catalog.
 *
 * These matter far more than their number suggests. An export written without
 * base quantities carries its dimensions only in the authoring tool's own
 * sets, so where that happens these are the *only* source of envelope numbers.
 *
 * Best-effort semantics: a vendor `Area` is not strictly a net area. The
 * standard `Qto_*` rules run after these and win wherever both are present,
 * so a file with proper quantities is never degraded by them.
 *
 * Excluded from standard coverage, deliberately. Counting a vendor rule
 * against the buildingSMART denominator would inflate the number with
 * something that is not standard at all.
 */
export const VENDOR_PROPERTY_RULES: FieldRule[] = [
  { from: "PSet_Revit_Dimensions.Area", to: "envelope.areaNet", unit: "m2" },
  {
    from: "PSet_Revit_Dimensions.Volume",
    to: "envelope.volumeNet",
    unit: "m3",
  },
  { from: "PSet_Revit_Dimensions.Length", to: "envelope.length", unit: "m" },
  {
    from: "PSet_Revit_Dimensions.Perimeter",
    to: "envelope.perimeter",
    unit: "m",
  },
  {
    from: "PSet_Revit_Dimensions.Unbounded Height",
    to: "envelope.height",
    unit: "m",
  },
  {
    from: "PSet_Revit_Type_Construction.Width",
    to: "envelope.thickness",
    unit: "m",
  },
];

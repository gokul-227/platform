import type { FieldRule } from "@aec-craft/platform-cbm-engine";

/**
 * What a space is for, and how many people it holds.
 *
 * Separate from `common.ts` because these write the `programme` block, which
 * is the one place a change of use is recorded. A room's use must never live
 * in its class: re-purposing an office as a store is a property write, not a
 * re-classification of the node.
 */
export const PROGRAMME_PROPERTY_RULES: FieldRule[] = [
  { from: "Pset_SpaceCommon.OccupancyType", to: "programme.use" },
  { from: "Pset_BuildingCommon.OccupancyType", to: "programme.use" },
  {
    from: "Pset_SpaceOccupancyRequirements.OccupancyNumber",
    to: "programme.occupancyTypical",
  },
  {
    from: "Pset_SpaceOccupancyRequirements.OccupancyNumberPeak",
    to: "programme.occupancyMax",
  },
];

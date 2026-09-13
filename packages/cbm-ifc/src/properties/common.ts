import type { FieldRule } from "@aec-craft/platform-cbm-engine";

/**
 * The `Pset_*Common` layer: properties that mean the same thing on many types.
 *
 * IFC declares them per entity, so `IsExternal` appears in eight different
 * property sets saying one thing. Writing the rule once per target and
 * spreading it over the sets that carry it keeps the intent legible: the shape
 * of this file says "one meaning, many sets", which a flat list would hide.
 */

const isExternal = (set: string): FieldRule => ({
  from: `${set}.IsExternal`,
  to: "envelope.isExternal",
});

const fireRating = (set: string): FieldRule => ({
  from: `${set}.FireRating`,
  to: "material.performance.fireResistance",
});

const thermalTransmittance = (set: string): FieldRule => ({
  from: `${set}.ThermalTransmittance`,
  to: "material.performance.uValue",
});

const loadBearing = (set: string): FieldRule => ({
  from: `${set}.LoadBearing`,
  to: "systems.structural.loadBearing",
});

/** Fire rating is the widest: almost everything can have one. */
const FIRE_RATED = [
  "Pset_BeamCommon",
  "Pset_ColumnCommon",
  "Pset_CoveringCommon",
  "Pset_CurtainWallCommon",
  "Pset_DoorCommon",
  "Pset_MemberCommon",
  "Pset_PlateCommon",
  "Pset_RoofCommon",
  "Pset_SlabCommon",
  "Pset_StairCommon",
  "Pset_WallCommon",
  "Pset_WindowCommon",
];

/** Only things that separate inside from outside, spaces included. */
const EXTERNAL_AWARE = [
  "Pset_CurtainWallCommon",
  "Pset_DoorCommon",
  "Pset_PlateCommon",
  "Pset_RoofCommon",
  "Pset_SlabCommon",
  "Pset_SpaceCommon",
  "Pset_WallCommon",
  "Pset_WindowCommon",
];

/** Only the envelope: a column has no U-value worth recording. */
const THERMAL = [
  "Pset_CoveringCommon",
  "Pset_CurtainWallCommon",
  "Pset_DoorCommon",
  "Pset_PlateCommon",
  "Pset_RoofCommon",
  "Pset_SlabCommon",
  "Pset_WallCommon",
  "Pset_WindowCommon",
];

/** Only things that could carry load. */
const STRUCTURAL = [
  "Pset_BeamCommon",
  "Pset_ColumnCommon",
  "Pset_MemberCommon",
  "Pset_PlateCommon",
  "Pset_SlabCommon",
  "Pset_WallCommon",
];

export const COMMON_PROPERTY_RULES: FieldRule[] = [
  ...EXTERNAL_AWARE.map(isExternal),
  ...FIRE_RATED.map(fireRating),
  ...THERMAL.map(thermalTransmittance),
  ...STRUCTURAL.map(loadBearing),
];

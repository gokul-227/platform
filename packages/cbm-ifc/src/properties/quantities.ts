import type { FieldRule } from "@aec-craft/platform-cbm-engine";

/**
 * The `Qto_*BaseQuantities` layer: measured numbers into the `envelope` block.
 *
 * Every rule declares the unit it wants and the adapter converts, so nothing
 * here has to know what the file was written in.
 *
 * Grouped by the entity family whose quantity set they read, because that is
 * how IFC names them and how you would look one up. Note how many different
 * sets feed the same target: `envelope.areaNet` is the net area of whatever
 * this is, and eight quantity sets say it in eight different words.
 */

const metres = (from: string, to: FieldRule["to"]): FieldRule => ({
  from,
  to,
  unit: "m",
});
const squareMetres = (from: string, to: FieldRule["to"]): FieldRule => ({
  from,
  to,
  unit: "m2",
});
const cubicMetres = (from: string, to: FieldRule["to"]): FieldRule => ({
  from,
  to,
  unit: "m3",
});

export const QUANTITY_RULES: FieldRule[] = [
  // walls
  metres("Qto_WallBaseQuantities.Length", "envelope.length"),
  metres("Qto_WallBaseQuantities.Height", "envelope.height"),
  metres("Qto_WallBaseQuantities.Width", "envelope.width"),
  squareMetres("Qto_WallBaseQuantities.NetSideArea", "envelope.areaNet"),
  squareMetres("Qto_WallBaseQuantities.GrossSideArea", "envelope.areaGross"),
  cubicMetres("Qto_WallBaseQuantities.NetVolume", "envelope.volumeNet"),
  cubicMetres("Qto_WallBaseQuantities.GrossVolume", "envelope.volumeGross"),

  // slabs
  squareMetres("Qto_SlabBaseQuantities.NetArea", "envelope.areaNet"),
  squareMetres("Qto_SlabBaseQuantities.GrossArea", "envelope.areaGross"),
  cubicMetres("Qto_SlabBaseQuantities.NetVolume", "envelope.volumeNet"),
  cubicMetres("Qto_SlabBaseQuantities.GrossVolume", "envelope.volumeGross"),
  metres("Qto_SlabBaseQuantities.Perimeter", "envelope.perimeter"),

  // columns and beams
  metres("Qto_ColumnBaseQuantities.Length", "envelope.length"),
  cubicMetres("Qto_ColumnBaseQuantities.NetVolume", "envelope.volumeNet"),
  metres("Qto_BeamBaseQuantities.Length", "envelope.length"),
  cubicMetres("Qto_BeamBaseQuantities.NetVolume", "envelope.volumeNet"),

  // members, plates, railings
  metres("Qto_MemberBaseQuantities.Length", "envelope.length"),
  cubicMetres("Qto_MemberBaseQuantities.NetVolume", "envelope.volumeNet"),
  cubicMetres("Qto_MemberBaseQuantities.GrossVolume", "envelope.volumeGross"),
  squareMetres("Qto_PlateBaseQuantities.NetArea", "envelope.areaNet"),
  squareMetres("Qto_PlateBaseQuantities.GrossArea", "envelope.areaGross"),
  cubicMetres("Qto_PlateBaseQuantities.NetVolume", "envelope.volumeNet"),
  metres("Qto_PlateBaseQuantities.Width", "envelope.thickness"),
  metres("Qto_RailingBaseQuantities.Length", "envelope.length"),

  // spaces: the set that matters most, since area per room is the commonest
  // question anyone asks a building model
  squareMetres("Qto_SpaceBaseQuantities.NetFloorArea", "envelope.areaNet"),
  squareMetres("Qto_SpaceBaseQuantities.GrossFloorArea", "envelope.areaGross"),
  metres("Qto_SpaceBaseQuantities.NetCeilingHeight", "envelope.height"),
  cubicMetres("Qto_SpaceBaseQuantities.NetVolume", "envelope.volumeNet"),
  cubicMetres("Qto_SpaceBaseQuantities.GrossVolume", "envelope.volumeGross"),
  metres("Qto_SpaceBaseQuantities.NetPerimeter", "envelope.perimeter"),

  // storeys
  squareMetres(
    "Qto_BuildingStoreyBaseQuantities.NetFloorArea",
    "envelope.areaNet"
  ),
  squareMetres(
    "Qto_BuildingStoreyBaseQuantities.GrossFloorArea",
    "envelope.areaGross"
  ),
  metres("Qto_BuildingStoreyBaseQuantities.GrossHeight", "envelope.height"),

  // coverings, doors, windows
  squareMetres("Qto_CoveringBaseQuantities.NetArea", "envelope.areaNet"),
  squareMetres("Qto_DoorBaseQuantities.Area", "envelope.areaNet"),
  squareMetres("Qto_WindowBaseQuantities.Area", "envelope.areaNet"),
];

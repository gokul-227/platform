import type { EntityMapping } from "@aec-craft/platform-cbm-engine";

import { node } from "../targets";

const MECHANISM = "spatial-structure";

/** Site down to space. The frame everything else is placed in. */
export const SPATIAL_ENTITIES: EntityMapping[] = [
  {
    source: "IfcSite",
    sourceType: "spatial",
    mechanism: MECHANISM,
    status: "full",
    target: node("site"),
    fields: [{ from: "Name", to: "name" }],
  },
  {
    source: "IfcBuilding",
    sourceType: "spatial",
    mechanism: MECHANISM,
    status: "full",
    target: node("building"),
    fields: [{ from: "Name", to: "name" }],
  },
  {
    source: "IfcBuildingStorey",
    sourceType: "spatial",
    mechanism: MECHANISM,
    status: "full",
    target: node("storey"),
    fields: [
      { from: "Name", to: "name" },
      // The storey states its own floor level. Read it rather than inferring a
      // height from geometry: this is the number the model author set.
      { from: "Elevation", to: "geometry.elevation", unit: "m" },
    ],
  },
  {
    // A room's use is not derivable from its IFC type, and guessing it from the
    // name is wrong often enough to be worse than silence. The class stays at
    // the root; `programme.use` carries the use, written from an authored
    // property set or by a later enrichment pass, never from this label.
    source: "IfcSpace",
    sourceType: "spatial",
    mechanism: MECHANISM,
    status: "full",
    target: node("space"),
    fields: [{ from: "LongName", to: "name" }],
  },
  {
    source: "IfcSpatialZone",
    sourceType: "spatial",
    mechanism: MECHANISM,
    status: "partial",
    target: node("space.zone"),
    fields: [{ from: "Name", to: "name" }],
  },
];

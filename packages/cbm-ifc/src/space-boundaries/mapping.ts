import type { EntityMapping } from "@aec-craft/platform-cbm-engine";

const MECHANISM = "space-boundaries";

/**
 * The only place IFC says which element encloses which space.
 *
 * Read element to space, so `bounds` means "this wall bounds that room"
 * whichever level of boundary produced it.
 */
const ENDPOINTS = {
  from: "RelatedBuildingElement",
  to: "RelatingSpace",
} as const;

export const SPACE_BOUNDARY_ENTITIES: EntityMapping[] = [
  {
    source: "IfcRelSpaceBoundary",
    sourceType: "relation",
    mechanism: MECHANISM,
    status: "full",
    target: { as: "edge", type: "bounds", endpoints: ENDPOINTS },
  },
  {
    // Second-level boundaries split a wall per adjacent space. Richer, but the
    // same fact for our purposes, so the same edge.
    source: "IfcRelSpaceBoundary2ndLevel",
    sourceType: "relation",
    mechanism: MECHANISM,
    status: "full",
    target: { as: "edge", type: "bounds", endpoints: ENDPOINTS },
  },
];

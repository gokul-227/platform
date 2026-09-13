import type { EntityMapping } from "@aec-craft/platform-cbm-engine";

const MECHANISM = "containment";

/**
 * Two relationships, one meaning.
 *
 * IFC splits "inside" in two: aggregation for the spatial tree, and spatial
 * containment for an element sitting on a storey. Nothing downstream benefits
 * from the distinction, so both become `contains`.
 */
export const CONTAINMENT_ENTITIES: EntityMapping[] = [
  {
    source: "IfcRelAggregates",
    sourceType: "relation",
    mechanism: MECHANISM,
    status: "full",
    target: {
      as: "edge",
      type: "contains",
      endpoints: { from: "RelatingObject", to: "RelatedObjects" },
    },
  },
  {
    source: "IfcRelContainedInSpatialStructure",
    sourceType: "relation",
    mechanism: MECHANISM,
    status: "full",
    target: {
      as: "edge",
      type: "contains",
      endpoints: { from: "RelatingStructure", to: "RelatedElements" },
    },
  },
];

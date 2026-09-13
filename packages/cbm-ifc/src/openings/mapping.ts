import type { EntityMapping } from "@aec-craft/platform-cbm-engine";

const MECHANISM = "openings";

export const OPENING_ENTITIES: EntityMapping[] = [
  {
    /**
     * Not the relationship as IFC writes it. A real `IfcRelFillsElement`
     * relates the *opening* to its filler; the reader composes it with the
     * voiding so this one names the host directly. Openings never become
     * nodes, so an edge to one would point at nothing.
     */
    source: "IfcRelFillsElement",
    sourceType: "relation",
    mechanism: MECHANISM,
    status: "partial",
    target: {
      as: "edge",
      type: "hostedIn",
      endpoints: {
        from: "RelatedBuildingElement",
        to: "RelatingBuildingElement",
      },
    },
  },
  {
    source: "IfcOpeningElement",
    sourceType: "element",
    mechanism: MECHANISM,
    status: "ignored",
    target: {
      as: "ignored",
      reason:
        "An opening is a hole, not a thing. It exists to carry the voiding and filling relationships, which are composed into hostedIn, and an unfilled one becomes a virtual connector. Importing them would put hundreds of holes in the graph of one building.",
    },
  },
];

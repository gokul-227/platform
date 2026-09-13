import type { EntityMapping } from "@aec-craft/platform-cbm-engine";

import { node } from "../targets";

const MECHANISM = "furnishing";

/** Loose fit-out: what is in the room rather than what makes it. */
const PAIRS = [
  ["IfcFurnishingElement", "element.furnishing"],
  ["IfcFurniture", "element.furniture"],
] as const;

export const FURNISHING_ENTITIES: EntityMapping[] = PAIRS.map(
  ([source, cls]): EntityMapping => ({
    source,
    sourceType: "element",
    mechanism: MECHANISM,
    status: "stub",
    target: node(cls),
    fields: [{ from: "Name", to: "name" }],
  })
);

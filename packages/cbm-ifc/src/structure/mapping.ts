import type { EntityMapping } from "@aec-craft/platform-cbm-engine";

import { node } from "../targets";

const MECHANISM = "structure";

/** What carries the load. */
const PAIRS = [
  ["IfcColumn", "element.column"],
  ["IfcBeam", "element.beam"],
  ["IfcMember", "element.member"],
  ["IfcFooting", "element.footing"],
  ["IfcPile", "element.pile"],
] as const;

export const STRUCTURE_ENTITIES: EntityMapping[] = PAIRS.map(
  ([source, cls]): EntityMapping => ({
    source,
    sourceType: "element",
    mechanism: MECHANISM,
    status: "partial",
    target: node(cls),
    fields: [{ from: "Name", to: "name" }],
  })
);

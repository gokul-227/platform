import { defineEdge, PARENT_ID_PRODUCER } from "../../registry/edge";

/**
 * The spatial tree, mirroring `parentId` for object nodes. A source's outline is
 * the same column mirrored as `includes`, and the two are kept apart on purpose:
 * a spatial traversal (`graph.dialect.ts` walks `CONTAINS|ADJACENT_TO|BOUNDS`)
 * must not be able to descend into a document.
 *
 * Note the direction: `parentId` lives on the child, this edge runs parent to
 * child. See the naming section of docs/cognitive-building-model.md.
 */
export const containsEdge = defineEdge({
  value: "contains",
  description:
    "The spatial containment hierarchy, mirroring `parentId` for objects: site → building → storey → space → element.",
  from: ["site", "building", "storey", "space"],
  to: ["site", "building", "storey", "space", "element", "interface"],
  cardinality: "oneToMany",
  symmetric: false,
  transitive: true,
  origin: { type: "derived", producer: PARENT_ID_PRODUCER },
});

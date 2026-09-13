import { defineEdge, PARENT_ID_PRODUCER } from "../../registry/edge";

/**
 * A document's outline, mirroring `parentId` for source nodes: act → part → §
 * → Absatz. The object tree's mirror of the same column is `contains`, and the
 * split is what lets either tree be walked without a class filter.
 *
 * `includes` rather than `contains` because the relation is different in kind: a
 * storey contains a space in physical space, an act includes a § by composition,
 * and only the first is what a spatial or egress query means.
 */
export const includesEdge = defineEdge({
  value: "includes",
  description:
    "The document outline, mirroring `parentId` for sources: act → part → § → Absatz.",
  from: ["source"],
  to: ["source"],
  cardinality: "oneToMany",
  symmetric: false,
  transitive: true,
  origin: { type: "derived", producer: PARENT_ID_PRODUCER },
});

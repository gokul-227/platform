import { defineEdge } from "../../registry/edge";

/**
 * Retires the earlier unit. The predecessor is kept rather than deleted: a
 * project approved under the old text is still governed by the old text, so
 * rules derived from it stay resolvable.
 */
export const supersedesEdge = defineEdge({
  value: "supersedes",
  description:
    "A source unit retires an earlier one, which is kept for projects still governed by it. Chains.",
  from: ["source"],
  to: ["source"],
  cardinality: "manyToOne",
  symmetric: false,
  transitive: true,
  origin: { type: "asserted" },
});

import { defineEdge } from "../../registry/edge";

/**
 * A revision that changes the text of an earlier unit while leaving it in force
 * elsewhere. Chains, so the amendment history of a unit is a walk. Distinct from
 * `supersedes`, which retires the earlier unit outright.
 */
export const amendsEdge = defineEdge({
  value: "amends",
  description:
    "A source unit amends an earlier revision of the same unit. Chains; each revision amends at most one predecessor.",
  from: ["source"],
  to: ["source"],
  cardinality: "manyToOne",
  symmetric: false,
  transitive: true,
  origin: { type: "asserted" },
});

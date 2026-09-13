import { defineEdge } from "../../registry/edge";

export const citesEdge = defineEdge({
  value: "cites",
  description:
    "A source unit refers to another, within the same instrument or across instruments. The citation network; not an amendment.",
  from: ["source"],
  to: ["source"],
  cardinality: "manyToMany",
  symmetric: false,
  transitive: false,
  origin: { type: "asserted" },
});

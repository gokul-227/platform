import { defineEdge } from "../../registry/edge";

export const adjacentToEdge = defineEdge({
  value: "adjacentTo",
  description:
    "Topological neighbourhood between zones: a shared boundary, not necessarily passable. See `connectsTo`.",
  from: ["space", "storey"],
  to: ["space", "storey"],
  cardinality: "manyToMany",
  symmetric: true,
  transitive: false,
  origin: { type: "derived", producer: "adapter.topology.adjacentTo" },
});

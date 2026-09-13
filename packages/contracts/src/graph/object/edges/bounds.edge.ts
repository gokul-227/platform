import { defineEdge } from "../../registry/edge";

export const boundsEdge = defineEdge({
  value: "bounds",
  description:
    "A bounding element (wall, slab, door) of a space. Lets space geometry and adjacency be derived without separate bounding objects.",
  from: ["element"],
  to: ["space", "storey"],
  cardinality: "manyToMany",
  symmetric: false,
  transitive: false,
  origin: { type: "derived", producer: "adapter.topology.bounds" },
});

import { defineEdge } from "../../registry/edge";

export const servesEdge = defineEdge({
  value: "serves",
  description:
    "A supplying system (HVAC, plumbing) provides service to a space or zone.",
  from: ["element"],
  to: ["space", "storey", "building"],
  cardinality: "manyToMany",
  symmetric: false,
  transitive: false,
  origin: { type: "imported" },
});

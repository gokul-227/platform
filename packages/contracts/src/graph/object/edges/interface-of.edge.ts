import { defineEdge } from "../../registry/edge";

export const interfaceOfEdge = defineEdge({
  value: "interfaceOf",
  description:
    "An interface node's two sides (element↔zone or zone↔zone). Reserved for space-boundary nodes.",
  from: ["interface"],
  to: ["space", "storey", "element"],
  cardinality: "manyToMany",
  symmetric: false,
  transitive: false,
  origin: { type: "derived", producer: "adapter.topology.interface" },
});

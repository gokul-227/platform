import { defineEdge } from "../../registry/edge";

/** A hosted element has exactly one host. */
export const hostedInEdge = defineEdge({
  value: "hostedIn",
  description:
    "A hosted element in its host (a door or window hosted in a wall).",
  from: ["element"],
  to: ["element"],
  cardinality: "manyToOne",
  symmetric: false,
  transitive: false,
  origin: { type: "imported" },
});

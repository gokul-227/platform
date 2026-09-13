import { adjacentToEdge } from "./adjacent-to.edge";
import { boundsEdge } from "./bounds.edge";
import { connectsToEdge } from "./connects-to.edge";
import { containsEdge } from "./contains.edge";
import { hostedInEdge } from "./hosted-in.edge";
import { interfaceOfEdge } from "./interface-of.edge";
import { servesEdge } from "./serves.edge";

export { adjacentToEdge } from "./adjacent-to.edge";
export { boundsEdge } from "./bounds.edge";
export { connectsToEdge } from "./connects-to.edge";
export { containsEdge } from "./contains.edge";
export { hostedInEdge } from "./hosted-in.edge";
export { interfaceOfEdge } from "./interface-of.edge";
export { servesEdge } from "./serves.edge";

/** The edges between objects, in canonical order. */
export const OBJECT_EDGES = [
  containsEdge,
  boundsEdge,
  adjacentToEdge,
  connectsToEdge,
  hostedInEdge,
  interfaceOfEdge,
  servesEdge,
] as const;

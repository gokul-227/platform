import { amendsEdge } from "./amends.edge";
import { citesEdge } from "./cites.edge";
import { includesEdge } from "./includes.edge";
import { supersedesEdge } from "./supersedes.edge";

export { amendsEdge } from "./amends.edge";
export { citesEdge } from "./cites.edge";
export { includesEdge } from "./includes.edge";
export { supersedesEdge } from "./supersedes.edge";

/** The edges between source units, in canonical order. */
export const SOURCE_EDGES = [
  includesEdge,
  citesEdge,
  amendsEdge,
  supersedesEdge,
] as const;

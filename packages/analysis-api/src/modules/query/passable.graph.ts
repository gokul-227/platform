import { scopedNodes } from "./scope.cypher";

/**
 * The projection the circulation analyses run over.
 *
 * `*0..1`, not `-[:CONNECTS_TO]-`: a projection built from a plain relationship
 * pattern omits every space that has no passage, which is what these analyses
 * look for. Measured on a real export, that reads 6 islands where the truth is
 * 185. OPTIONAL MATCH does not help: a null path is dropped too.
 *
 * Both ends are scoped. The far end is only reachable through an edge whose
 * endpoints the write path already constrains, but a read that depends on a
 * write-time invariant is a read that breaks when the invariant does.
 */
export const PASSABLE_GRAPH = `
  MATCH p=(n:Node)-[:\`CONNECTS_TO\`*0..1]-(m:Node)
  WHERE ${scopedNodes("n", "m")}
    AND (n.class = 'space' OR n.class STARTS WITH ('space' + '.'))
    AND ($parentId IS NULL OR n.parentId = $parentId)
  WITH project(p) AS graph`;

/**
 * The travel-cost lambda for `*wShortest`.
 *
 * The guard is required: the lambda runs once for the start node, where `r` is
 * null, so a bare `coalesce(r.length, 1.0)` adds a phantom unit to every route.
 * Measured: one passage of length 8 reported 9.
 */
export const TRAVEL_COST =
  "(r, n | CASE WHEN r IS NULL THEN 0.0 ELSE coalesce(r.length, 1.0) END)";

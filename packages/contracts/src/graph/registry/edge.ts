import type { z } from "zod";

/**
 * An edge type definition: the twin of `defineBlock`. An edge is a block with two
 * endpoints, so the shape is the same (a key, a description, an optional schema
 * for its own properties) plus the relation metadata that makes the differences
 * between `contains` and `adjacentTo` declarative rather than behavioural.
 *
 * Storage never varies: one directed row per edge, always. Symmetric types are
 * canonicalised on write so `sourceId < targetId`, which makes `adjacentTo(a,b)`
 * and `adjacentTo(b,a)` the same row and keeps the content hash stable under
 * topology re-derivation. The query layer reads `symmetric` and `transitive` to
 * emit `-[:X]-` or `-[:X*]->` instead of `-[:X]->`.
 *
 * See docs/cognitive-building-model.md.
 */

/** Which end a "one" constrains: `oneToMany` caps the target's incoming edges of
 *  this type, `manyToOne` caps the source's outgoing. One field covers both
 *  exclusivity cases (a node has one container, a window has one host). */
export type EdgeCardinality =
  | "oneToOne"
  | "oneToMany"
  | "manyToOne"
  | "manyToMany";

/** `derived` edges are disposable and rebuildable; `producer` names what to
 *  re-run. `asserted` edges are authored and are never regenerated. */
export type EdgeOrigin =
  | { type: "asserted" }
  | { type: "imported" }
  | { type: "derived"; producer: string };

/**
 * The producer of the containment edges: the `parentId` column, which every node
 * type has. An edge declaring it is the mirror of that column for its own tree,
 * and `containmentEdgeFor` in `vocabulary.ts` is how the projection finds which
 * one applies to a given class root.
 */
export const PARENT_ID_PRODUCER = "graph.parentId";

export interface EdgeDefinition<
  V extends string = string,
  S extends z.ZodTypeAny = z.ZodTypeAny,
> {
  cardinality: EdgeCardinality;
  description: string;
  /** Allowed source class patterns (`element.*`, `space`). Advisory: a
   *  mismatched endpoint is counted as drift, never rejected. */
  from: readonly string[];
  origin: EdgeOrigin;
  /** Optional schema for the edge's own `properties` bag. */
  schema?: S;
  /** Whether direction carries meaning. Symmetric writes are canonicalised. */
  symmetric: boolean;
  /** Allowed target class patterns. */
  to: readonly string[];
  /** Whether the relation composes along a chain (`contains`, `amends`). */
  transitive: boolean;
  /** The wire value, named `value` to match NODE_TYPES and CLASS_ROOTS. */
  value: V;
}

export function defineEdge<V extends string, S extends z.ZodTypeAny>(
  definition: EdgeDefinition<V, S>
): EdgeDefinition<V, S> {
  return definition;
}

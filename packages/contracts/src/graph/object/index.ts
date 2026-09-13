/**
 * The `object` type manifest: which class roots it may use, which blocks it may
 * carry, which edges it owns. This is what the vocabulary endpoint serves and
 * what the drift classifier checks against.
 */

import { BLOCKS } from "./blocks";
import { OBJECT_CLASS_ROOTS } from "./class.root";
import { OBJECT_EDGES } from "./edges";

export * from "./blocks";
export { OBJECT_CLASS_ROOTS } from "./class.root";
export { CANONICAL_CLASSES, type CanonicalClass } from "./class.taxonomy";
export * from "./edges";

export const OBJECT_MANIFEST = {
  nodeType: "object",
  classRoots: OBJECT_CLASS_ROOTS,
  blocks: BLOCKS,
  edges: OBJECT_EDGES,
} as const;

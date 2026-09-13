/**
 * The composition layer: the three type manifests joined into the canonical
 * lists, the classifier, and the importable `GRAPH_VOCABULARY` bundle.
 *
 * Composition lives here rather than in `base/` so the dependency runs one way:
 * base holds type-agnostic primitives, each type folder declares its own
 * vocabulary, and this file is the only place that knows about all three.
 */

import { type CanonicalBlockKey, OBJECT_MANIFEST } from "./object";
import { PARENT_ID_PRODUCER } from "./registry/edge";
import { type CanonicalNodeType, NODE_TYPES } from "./registry/node.type";
import type { RuleBlockKey } from "./rule";
import { RULE_MANIFEST } from "./rule";
import type { SourceBlockKey } from "./source";
import { SOURCE_MANIFEST } from "./source";

const MANIFESTS = [OBJECT_MANIFEST, RULE_MANIFEST, SOURCE_MANIFEST] as const;

// ── Class roots ────────────────────────────────────────────────────────────
export const CLASS_ROOTS = [
  ...OBJECT_MANIFEST.classRoots,
  ...RULE_MANIFEST.classRoots,
  ...SOURCE_MANIFEST.classRoots,
] as const satisfies ReadonlyArray<{
  description: string;
  nodeType: CanonicalNodeType;
  value: string;
}>;

export type CanonicalClassRoot = (typeof CLASS_ROOTS)[number]["value"];

export const CANONICAL_CLASS_ROOTS: readonly CanonicalClassRoot[] =
  CLASS_ROOTS.map((root) => root.value);

export const CLASS_ROOT_TO_NODE_TYPE = Object.fromEntries(
  CLASS_ROOTS.map((root) => [root.value, root.nodeType])
) as Record<CanonicalClassRoot, CanonicalNodeType>;

/**
 * The canonical node type for a class, from its first dot-segment. Null when the
 * root is not canonical, so callers decide whether to fall back or flag drift.
 *
 *   nodeTypeFromClass("space.circulation")          // "object"
 *   nodeTypeFromClass("source.law.lbo_bw")        // "source"
 *   nodeTypeFromClass("custom.weird.thing")          // null
 */
export function nodeTypeFromClass(cls: string): CanonicalNodeType | null {
  const root = cls.split(".", 1)[0];
  if (root && root in CLASS_ROOT_TO_NODE_TYPE) {
    return CLASS_ROOT_TO_NODE_TYPE[root as CanonicalClassRoot];
  }
  return null;
}

// ── Edge types ─────────────────────────────────────────────────────────────
export const EDGE_TYPES = [
  ...OBJECT_MANIFEST.edges,
  ...RULE_MANIFEST.edges,
  ...SOURCE_MANIFEST.edges,
] as const;

export type CanonicalEdgeType = (typeof EDGE_TYPES)[number]["value"];

export const CANONICAL_EDGE_TYPES: readonly CanonicalEdgeType[] =
  EDGE_TYPES.map((edgeType) => edgeType.value);

/** Edge definitions by wire value, for the write canonicaliser and the Cypher
 *  builder: `symmetric` decides `-[:X]-` versus `-[:X]->`, `transitive` gates
 *  variable-length patterns, `cardinality` and `from`/`to` drive drift counting. */
export const EDGE_DEFINITIONS = Object.fromEntries(
  EDGE_TYPES.map((edgeType) => [edgeType.value, edgeType])
) as Record<CanonicalEdgeType, (typeof EDGE_TYPES)[number]>;

/**
 * The containment edge a node's `parentId` mirrors as, chosen by the node's own
 * class root: `contains` for the spatial tree, `includes` for a document
 * outline. One column, two relations, because a spatial traversal must not
 * descend into a document and a citation walk must not wander into a building.
 *
 * Keyed by the child's root (the `to` end), because `parentId` lives on the
 * child and the parent may not be projected yet. Derived from the definitions
 * that name `parentId` as their producer, so a third tree needs no change here.
 * Null for a root that belongs to no tree, which today is `rule`.
 */
const CONTAINMENT_BY_CLASS_ROOT: Record<string, CanonicalEdgeType> =
  Object.fromEntries(
    EDGE_TYPES.filter(
      (edgeType) =>
        edgeType.origin.type === "derived" &&
        edgeType.origin.producer === PARENT_ID_PRODUCER
    ).flatMap((edgeType) => edgeType.to.map((root) => [root, edgeType.value]))
  );

export function containmentEdgeFor(
  classRoot: string
): CanonicalEdgeType | null {
  return CONTAINMENT_BY_CLASS_ROOT[classRoot] ?? null;
}

// ── Block keys ─────────────────────────────────────────────────────────────
const ALL_BLOCKS = MANIFESTS.flatMap(
  (manifest) =>
    manifest.blocks as readonly { description: string; key: string }[]
);

/**
 * Every block key any node type may carry. `CanonicalBlockKey` stays the object
 * set: it is re-exported and consumed as an object block path, so widening it
 * would change what a caller's `${CanonicalBlockKey}.${string}` accepts.
 */
export type GraphBlockKey = CanonicalBlockKey | RuleBlockKey | SourceBlockKey;

export const CANONICAL_BLOCK_KEYS: readonly GraphBlockKey[] = ALL_BLOCKS.map(
  (block) => block.key
) as readonly GraphBlockKey[];

// ── Classifier ─────────────────────────────────────────────────────────────
export type VocabularyType =
  | "node_type"
  | "edge_type"
  | "class_root"
  | "block_key";
export type VocabularyClassification = "canonical" | "experimental";

const CANONICAL_SETS: Record<VocabularyType, ReadonlySet<string>> = {
  node_type: new Set(NODE_TYPES.map((nodeType) => nodeType.value)),
  edge_type: new Set(CANONICAL_EDGE_TYPES),
  class_root: new Set(CANONICAL_CLASS_ROOTS),
  block_key: new Set(CANONICAL_BLOCK_KEYS),
};

/**
 * Whether a value is in the canonical list for its type. For `class_root` and
 * `block_key` the input is the first dot-segment or the bag key, not the full
 * class or property path; callers split before invoking. Advisory: the API
 * accepts `experimental` values and reports them via a drift counter.
 */
export function classifyVocabulary(
  type: VocabularyType,
  value: string
): VocabularyClassification {
  return CANONICAL_SETS[type].has(value) ? "canonical" : "experimental";
}

// ── The importable bundle ──────────────────────────────────────────────────
function descriptionsOf<T>(
  items: readonly T[],
  key: (item: T) => string,
  description: (item: T) => string
): Record<string, string> {
  return Object.fromEntries(
    items.map((item) => [key(item), description(item)])
  );
}

/**
 * The importable bundle of canonical lists with per-value descriptions plus the
 * class-root → type mapping, all derived from the manifests, so it can never
 * drift from them. The SDK exposes this at `client.graph.vocabulary` and React
 * surfaces it via `useGraphVocabulary()`.
 */
export const GRAPH_VOCABULARY = {
  nodeTypes: {
    canonical: NODE_TYPES.map((nodeType) => nodeType.value),
    descriptions: descriptionsOf(
      NODE_TYPES,
      (nodeType) => nodeType.value,
      (nodeType) => nodeType.description
    ),
  },
  edgeTypes: {
    canonical: EDGE_TYPES.map((edgeType) => edgeType.value),
    descriptions: descriptionsOf(
      EDGE_TYPES,
      (edgeType) => edgeType.value,
      (edgeType) => edgeType.description
    ),
  },
  classRoots: {
    canonical: CLASS_ROOTS.map((root) => root.value),
    descriptions: descriptionsOf(
      CLASS_ROOTS,
      (root) => root.value,
      (root) => root.description
    ),
    typeMapping: CLASS_ROOT_TO_NODE_TYPE,
  },
  blockKeys: {
    canonical: ALL_BLOCKS.map((block) => block.key),
    descriptions: descriptionsOf(
      ALL_BLOCKS,
      (block) => block.key,
      (block) => block.description
    ),
  },
} as const;

export type GraphVocabulary = typeof GRAPH_VOCABULARY;

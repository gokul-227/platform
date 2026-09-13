/**
 * Canonical node types: the three structural kinds a node can be. The class
 * root determines which (see `class.root`). Single source: the canonical list,
 * union type, and manifest descriptions all read this.
 */
export const NODE_TYPES = [
  {
    value: "object",
    description:
      "Physical or logical things: zones (sites, buildings, storeys, spaces), elements, interfaces. Carry geometry, programme, and material blocks.",
  },
  {
    value: "rule",
    description:
      "Normative or project rules as first-class nodes. Carry a selector (who they apply to), a criterion (what they demand), enforcement and provenance. Binding is a verdict row, not an edge.",
  },
  {
    value: "source",
    description:
      "External reference points: laws, norms, datasheets, specs. Version-aware (a norm update is a new versioned node).",
  },
] as const;

export type CanonicalNodeType = (typeof NODE_TYPES)[number]["value"];

export const CANONICAL_NODE_TYPES: readonly CanonicalNodeType[] =
  NODE_TYPES.map((nodeType) => nodeType.value);

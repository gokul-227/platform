import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

export const GraphNodeErrors = {
  NOT_FOUND: {
    code: "GRAPH_NODE_NOT_FOUND",
    status: 404,
    name: "Node not found",
    description: "No node matches the supplied id within the requested scope.",
  },
  BATCH_ID_CONFLICT: {
    code: "GRAPH_NODE_BATCH_ID_CONFLICT",
    status: 409,
    name: "Batch id conflict",
    description:
      "A client-supplied node id in a `create` op already exists, or an `upsert` targets an id stored outside the changeset's scope or with a different immutable `type`. Choose a different id or align the op with the stored node.",
  },
  CLASS_ROOT_IMMUTABLE: {
    code: "GRAPH_NODE_CLASS_ROOT_IMMUTABLE",
    status: 409,
    name: "Class root is immutable",
    description:
      "A node's `class` may be refined within its root (`space` to `space.circulation`) but the root itself is fixed. The root determines the node's `type`, so changing it would swap which blocks are valid, which edges may attach and which rules bind, on an id that already has history. Delete and recreate instead.",
  },
  PARENT_NOT_FOUND: {
    code: "GRAPH_NODE_PARENT_NOT_FOUND",
    status: 404,
    name: "Parent node not found",
    description:
      "The supplied `parentId` does not match any node visible from this scope.",
  },
  PARENT_CROSS_SCOPE: {
    code: "GRAPH_NODE_PARENT_CROSS_SCOPE",
    status: 409,
    name: "Parent in incompatible scope",
    description:
      "A node's parent must be in the same or a wider scope. Project nodes may parent to nodes in the same project or in the parent org; org nodes may parent only within the same org. Cross-project and cross-org parents are rejected.",
  },
  PARENT_CYCLE: {
    code: "GRAPH_NODE_PARENT_CYCLE",
    status: 409,
    name: "Parent cycle",
    description:
      "Setting this `parentId` would introduce a cycle in the parent chain.",
  },
  PROPERTIES_TOO_LARGE: {
    code: "GRAPH_NODE_PROPERTIES_TOO_LARGE",
    status: 413,
    name: "Properties payload too large",
    description:
      "The combined properties blob exceeds the per-node size limit. Split data across multiple nodes connected by edges.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;

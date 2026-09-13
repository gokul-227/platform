import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

export const GraphEdgeErrors = {
  NOT_FOUND: {
    code: "GRAPH_EDGE_NOT_FOUND",
    status: 404,
    name: "Edge not found",
    description: "No edge matches the supplied id within the requested scope.",
  },
  BATCH_ID_CONFLICT: {
    code: "GRAPH_EDGE_BATCH_ID_CONFLICT",
    status: 409,
    name: "Batch id conflict",
    description:
      "A client-supplied edge id in a `create` op already exists, or an `upsert` targets an id stored outside the changeset's scope or with different endpoints (`sourceId`/`targetId` are immutable). Choose a different id or align the op with the stored edge.",
  },
  SOURCE_NOT_FOUND: {
    code: "GRAPH_EDGE_SOURCE_NOT_FOUND",
    status: 404,
    name: "Edge source not found",
    description:
      "The supplied `sourceId` does not match any node visible from this scope.",
  },
  TARGET_NOT_FOUND: {
    code: "GRAPH_EDGE_TARGET_NOT_FOUND",
    status: 404,
    name: "Edge target not found",
    description:
      "The supplied `targetId` does not match any node visible from this scope.",
  },
  SELF_LOOP: {
    code: "GRAPH_EDGE_SELF_LOOP",
    status: 400,
    name: "Self-loop",
    description: "`sourceId` and `targetId` must differ.",
  },
  CROSS_ORG: {
    code: "GRAPH_EDGE_CROSS_ORG",
    status: 409,
    name: "Cross-org edge",
    description:
      "Edges may not span two different organizations. Both endpoints must share an org (with one optionally living at the org scope).",
  },
  CROSS_PROJECT: {
    code: "GRAPH_EDGE_CROSS_PROJECT",
    status: 409,
    name: "Cross-project edge",
    description:
      "Edges may not span two different projects within the same org. A project that needs to reference data from a sibling project should fork its own copy.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;

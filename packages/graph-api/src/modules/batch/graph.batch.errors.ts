import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

export const GraphBatchErrors = {
  EDGE_ENDPOINT_DELETED: {
    code: "GRAPH_BATCH_EDGE_ENDPOINT_DELETED",
    status: 409,
    name: "Edge endpoint deleted in same changeset",
    description:
      "A `create`/`upsert` edge op references a node that a `delete` op in the same changeset removes. The node delete would cascade the edge away, so the write is rejected up front. Split the delete into a later changeset, or drop the edge op.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;

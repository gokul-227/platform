import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

/**
 * A code of its own rather than `GRAPH_NODE_NOT_FOUND`, which would describe the
 * store behind the resource instead of the request. The service translates.
 */
export const ObjectErrors = {
  NOT_FOUND: {
    code: "OBJECT_NOT_FOUND",
    status: 404,
    name: "Object not found",
    description:
      'No object matches the supplied id within the requested scope. A node of another type answers the same way: a caller who could tell "exists but is not an object" from "does not exist" would hold a map of what exists.',
  },
} as const satisfies Record<string, PlatformErrorSpec>;

import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

/**
 * A code of its own rather than `GRAPH_NODE_NOT_FOUND`, which would describe the
 * store behind the resource instead of the request. The service translates.
 */
export const RuleErrors = {
  NOT_FOUND: {
    code: "RULE_NOT_FOUND",
    status: 404,
    name: "Rule not found",
    description:
      'No rule matches the supplied id within the requested scope. A node of another type answers the same way: a caller who could tell "exists but is not a rule" from "does not exist" would hold a map of what exists.',
  },
} as const satisfies Record<string, PlatformErrorSpec>;

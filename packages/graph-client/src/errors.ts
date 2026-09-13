import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

/**
 * One code, because there is one thing this package can refuse: the projection
 * is not reachable. Everything about what a statement may say belongs to
 * whoever wrote the statement.
 */
export const GraphClientErrors = {
  UNAVAILABLE: {
    code: "GRAPH_UNAVAILABLE",
    status: 503,
    name: "Graph database unreachable",
    description:
      "The graph view is not reachable. Postgres (the source of truth) is unaffected; retry later.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;

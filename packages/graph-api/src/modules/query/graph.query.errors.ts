import type { PlatformErrorSpec } from "@aec-craft/platform-contracts";

/**
 * What this route refuses about a statement. Whether the projection is
 * reachable at all is `GraphClientErrors.UNAVAILABLE`, from the package that
 * holds the connection.
 */
export const GraphQueryErrors = {
  CYPHER_NOT_READ_ONLY: {
    code: "GRAPH_QUERY_CYPHER_NOT_READ_ONLY",
    status: 400,
    name: "Query is not read-only",
    description:
      "Only read statements are accepted here. Write clauses (CREATE, MERGE, SET, DELETE, REMOVE, ...) are rejected; mutate through the REST routes so versioning and sync stay correct.",
  },
  CYPHER_UNSCOPED: {
    code: "GRAPH_QUERY_CYPHER_UNSCOPED",
    status: 400,
    name: "Query names no scope",
    description:
      "Every node pattern must carry the `:Scoped` label, which resolves to the project you asked for: `MATCH (n:Scoped) RETURN n`, `MATCH (s:Storey:Scoped) RETURN s.name`. A pattern without it would match the whole projection, and an anonymous `()` cannot be fenced at all.",
  },
  CYPHER_SCOPE_RESERVED: {
    code: "GRAPH_QUERY_CYPHER_SCOPE_RESERVED",
    status: 400,
    name: "Query names a partition",
    description:
      "`Scope_`, `Org_` and `Project_` labels belong to the server. Write `:Scoped` and the partition you are authorized for is filled in.",
  },
  CYPHER_VARIABLE_LENGTH: {
    code: "GRAPH_QUERY_CYPHER_VARIABLE_LENGTH",
    status: 400,
    name: "Variable-length traversal is not offered here",
    description:
      "A `[*]` hop walks through nodes no pattern constrained, so its results cannot be fenced. Name each hop, or use an analysis route, which computes reachability inside the scope.",
  },
  CYPHER_SCOPE_VIOLATION: {
    code: "GRAPH_QUERY_CYPHER_SCOPE_VIOLATION",
    status: 403,
    name: "Query returned out-of-scope entities",
    description:
      "A returned node or relationship is outside the authorized project (or its org's shared library). Filter on $projectId; results are scope-checked fail-closed.",
  },
} as const satisfies Record<string, PlatformErrorSpec>;

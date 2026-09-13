/**
 * An analysis is always project-scoped: a project id, and the groups inside it
 * the caller may read. Both predicates go in the query — an aggregate filtered
 * by project alone counts rows in groups the caller cannot see, and a wrong
 * count still looks like a count.
 *
 * Here rather than in contracts: `readableGroups` is what the authorization
 * kernel resolved for this caller, and contracts publishes to clients. A client
 * must never be handed the group set a server filtered on.
 */
export interface AnalysisScope {
  projectId: string;
  readableGroups: readonly string[];
}

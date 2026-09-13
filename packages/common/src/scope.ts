/**
 * Re-export of the scope spine, which lives in contracts so the authorization
 * layer and the SQL predicates can both read it without importing each other.
 * The drizzle where-predicates live in `./drizzle/scope.ts`.
 */

export {
  isOrgScope,
  type ResolvedScope,
  rowInScope,
  type ScopedRow,
  scopeFromRow,
} from "@aec-craft/platform-contracts";

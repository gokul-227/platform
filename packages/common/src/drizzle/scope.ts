import type { ResolvedScope } from "@aec-craft/platform-contracts";
import { inArray, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Drizzle variants of the scope predicates (see `../scope.ts` for the
 * semantics). A row is org-scoped when `projectId IS NULL`.
 *
 * These bound the *partition* a query reads, never who may read it. Authorization
 * is `groupWhereReadable`, and a list query needs both: the partition says which
 * project's rows were asked for, the group predicate says which of them this
 * caller may see.
 */

export interface ScopeColumns {
  orgId: AnyPgColumn;
  projectId: AnyPgColumn;
}

/** Strict scope predicate: a write/by-id match bound to exactly one scope. */
export function scopeWhereStrict(
  columns: ScopeColumns,
  scope: ResolvedScope
): SQL {
  if (scope.projectId == null) {
    return sql`(${columns.orgId} = ${scope.orgId} AND ${columns.projectId} IS NULL)`;
  }
  return sql`${columns.projectId} = ${scope.projectId}`;
}

/**
 * Visibility predicate for reads. Org scope sees org rows only; project scope
 * sees its own project plus the parent org's library, narrowable via
 * `scopeFilter`.
 */
export function scopeWhereVisible(
  columns: ScopeColumns,
  scope: ResolvedScope,
  scopeFilter?: "project" | "org"
): SQL {
  if (scope.projectId == null) {
    return sql`(${columns.orgId} = ${scope.orgId} AND ${columns.projectId} IS NULL)`;
  }
  if (scopeFilter === "project") {
    return sql`${columns.projectId} = ${scope.projectId}`;
  }
  if (scopeFilter === "org") {
    return sql`(${columns.orgId} = ${scope.orgId} AND ${columns.projectId} IS NULL)`;
  }
  return sql`(${columns.projectId} = ${scope.projectId} OR (${columns.orgId} = ${scope.orgId} AND ${columns.projectId} IS NULL))`;
}

/**
 * The authorization predicate for every list query: the rows belong to a group
 * this caller may read. One low-cardinality column, resolved fresh per request,
 * so a revocation takes effect on the next query.
 *
 * An empty readable set is `false`, not "no filter". Drizzle's `inArray` with an
 * empty array has changed behaviour across versions, and the failure mode of
 * getting that wrong here is returning the whole partition to someone who may
 * read none of it.
 */
export function groupWhereReadable(
  column: AnyPgColumn,
  readable: readonly string[]
): SQL {
  if (readable.length === 0) {
    return sql`false`;
  }
  return inArray(column, [...readable]);
}

/**
 * Per-module filter specification.
 *
 * Each list endpoint declares its filterable fields with `defineFilters` plus
 * the `column` builder family. `filter.schema.ts` turns the result into the zod
 * fragment merged into the list input, and `drizzle/filter.apply.ts` turns the
 * parsed input into `where` and `orderBy` clauses.
 *
 * A spec is wire vocabulary rather than storage, so the SDK and the document
 * generator can reflect on it. The column-to-SQL mapping is small enough that
 * the applier reads the spec directly rather than a second table.
 *
 * Example:
 *
 *   import { defineFilters, column, jsonbPath } from ".";
 *
 *   export const orgMemberFilters = defineFilters({
 *     standing: column.string({ ops: ["eq", "in"], sortable: true }),
 *     joinedAt: column.date({ ops: ["gte", "lte"], column: "createdAt", sortable: true }),
 *     email:    column.string({ ops: ["eq", "startsWith", "contains"], column: "user.email" }),
 *     properties: jsonbPath({ ops: ["hasKey", "eq", "gte"] }),
 *   });
 */

import type { FilterOp, FilterValueType } from "./operator";

/** Common options every column type accepts. */
interface ColumnOptionsBase<Ops extends FilterOp> {
  /**
   * Override when the wire field name differs from the SQL column name. May
   * include a table alias (`user.email`) — the applier passes the dotted
   * path straight through to the query builder, so the alias must be in scope on the
   * query builder.
   */
  column?: string;
  /** Description used in the generated zod `.describe()` and OpenAPI docs. */
  description?: string;
  /** Operators allowed on this field. Validated at parse time. */
  ops: readonly Ops[];
  /** When true, the field is eligible for `?sort=field:asc|desc`. */
  sortable?: boolean;
}

/** A single column-field entry in the spec. */
export type ColumnFilter<Ops extends FilterOp = FilterOp> =
  ColumnOptionsBase<Ops> & {
    type: "column";
    valueType: FilterValueType;
  };

/**
 * A JSONB-path entry. The wire syntax uses the Postgres arrow notation on
 * the key (e.g. `?properties->meta->version=gte.2`); the applier walks
 * the path with `#>>` / `#>` depending on the op.
 */
export type JsonbPathFilter<Ops extends FilterOp = FilterOp> =
  ColumnOptionsBase<Ops> & {
    type: "jsonbPath";
  };

/** Any spec entry. */
export type FilterEntry<Ops extends FilterOp = FilterOp> =
  | ColumnFilter<Ops>
  | JsonbPathFilter<Ops>;

/** The shape returned by `defineFilters`. */
export type FilterSpec = Readonly<Record<string, FilterEntry>>;

/**
 * Tag a record as a filter spec. Pure identity helper — exists for
 * documentation symmetry with `defineSchema` style builders elsewhere and
 * to give a stable place to add invariants (e.g. asserting `sortable`
 * fields aren't on JSONB paths) when they're worth checking at definition
 * time.
 */
export function defineFilters<T extends FilterSpec>(spec: T): T {
  return spec;
}

// ── Column builders ──────────────────────────────────────────────────────
// Each thin factory just sets `type: "column"` and the right `valueType`.
// Splitting per type makes the per-op allow-list type-safe (you can't
// declare `gt` on a `boolean` column without TypeScript erroring once
// per-type op restrictions are tightened — left open for v1).

interface ColumnTypedOptions<Ops extends FilterOp> {
  column?: string;
  description?: string;
  ops: readonly Ops[];
  sortable?: boolean;
}

export const column = {
  string<const Ops extends FilterOp>(
    options: ColumnTypedOptions<Ops>
  ): ColumnFilter<Ops> {
    return { type: "column", valueType: "string", ...options };
  },
  number<const Ops extends FilterOp>(
    options: ColumnTypedOptions<Ops>
  ): ColumnFilter<Ops> {
    return { type: "column", valueType: "number", ...options };
  },
  uuid<const Ops extends FilterOp>(
    options: ColumnTypedOptions<Ops>
  ): ColumnFilter<Ops> {
    return { type: "column", valueType: "uuid", ...options };
  },
  date<const Ops extends FilterOp>(
    options: ColumnTypedOptions<Ops>
  ): ColumnFilter<Ops> {
    return { type: "column", valueType: "date", ...options };
  },
  boolean<const Ops extends FilterOp>(
    options: ColumnTypedOptions<Ops>
  ): ColumnFilter<Ops> {
    return { type: "column", valueType: "boolean", ...options };
  },
} as const;

export function jsonbPath<const Ops extends FilterOp>(
  options: ColumnTypedOptions<Ops>
): JsonbPathFilter<Ops> {
  return { type: "jsonbPath", ...options };
}

// ── Spec introspection helpers ───────────────────────────────────────────

/** Names of fields the spec declares `sortable: true` on. */
export function sortableFields(spec: FilterSpec): string[] {
  return Object.entries(spec)
    .filter(([, entry]) => entry.sortable === true)
    .map(([name]) => name);
}

/** Resolve a spec field's column path (alias-prefixed when overridden). */
export function columnFor(name: string, entry: FilterEntry): string {
  return entry.column ?? name;
}

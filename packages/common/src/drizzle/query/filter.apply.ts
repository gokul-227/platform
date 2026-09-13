import type { FilterSpec, ParsedFilter } from "@aec-craft/platform-contracts";
import {
  parseFilters,
  parseSort,
  type ResolvedFilter,
} from "@aec-craft/platform-contracts";
import { type SQL, sql } from "drizzle-orm";

/**
 * Drizzle variants of the filter/sort appliers (see `../filters/apply.ts` for
 * the shared grammar and semantics). Parsing/validation is shared; this
 * module only emits drizzle `SQL` fragments:
 *
 *   const conditions = filterConditions(spec, query);
 *   db.select().from(t).where(and(scopeCondition, ...conditions))
 *     .orderBy(...sortExpressions(spec, query, fallback));
 *
 * Column paths come from the server-defined spec (never client input) and go
 * through `sql.identifier`; comparison values are bound parameters.
 */

/** One drizzle condition per filter declared in `spec` + present in `input`. */
export function filterConditions(
  spec: FilterSpec,
  input: Record<string, unknown>
): SQL[] {
  return parseFilters(spec, input).map((filter) => predicateFor(filter));
}

/** `?sort=field:dir` (repeatable) as drizzle ORDER BY expressions, in token order. */
export function sortExpressions(
  spec: FilterSpec,
  input: Record<string, unknown>
): SQL[] {
  return parseSort(spec, input.sort).map((s) =>
    s.dir === "desc"
      ? sql`${identifier(s.column)} DESC`
      : sql`${identifier(s.column)} ASC`
  );
}

// ── internals ────────────────────────────────────────────────────────────

// Specs name columns in wire camelCase; the DB layer is snake_case. The
// camelCase wire field -> snake_case column; drizzle needs it spelled out.
function toSnakeCase(part: string): string {
  return part.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function identifier(columnPath: string): SQL {
  const parts = columnPath.split(".");
  return sql.join(
    parts.map((part) => sql`${sql.identifier(toSnakeCase(part))}`),
    sql`.`
  );
}

function predicateFor(f: ResolvedFilter): SQL {
  if (f.type === "jsonbPath") {
    return jsonbPredicate(f);
  }
  return columnPredicate(identifier(f.column), f.parsed);
}

function columnPredicate(column: SQL, p: ParsedFilter): SQL {
  switch (p.op) {
    case "eq":
      return sql`${column} = ${p.value}`;
    case "ne":
      return sql`${column} <> ${p.value}`;
    case "gt":
      return sql`${column} > ${p.value}`;
    case "gte":
      return sql`${column} >= ${p.value}`;
    case "lt":
      return sql`${column} < ${p.value}`;
    case "lte":
      return sql`${column} <= ${p.value}`;
    case "like":
      return sql`${column} LIKE ${p.value}`;
    case "ilike":
      // Used by like + startsWith / endsWith / contains (parser compiled
      // the pattern; the op landed as "ilike" by the time we get here).
      return sql`${column} ILIKE ${p.value}`;
    case "in":
      // `sql.param` keeps the JS array one bind parameter; interpolating the
      // array directly expands it into a row constructor, which 42809s.
      return sql`${column} = ANY(${sql.param(p.value)})`;
    case "nin":
      return sql`${column} <> ALL(${sql.param(p.value)})`;
    case "hasKey":
      // hasKey on a plain column falls back to a presence check (the parser
      // enforces hasKey only for jsonbPath entries).
      return sql`${column} IS NOT NULL`;
    default: {
      const _exhaustive: never = p;
      void _exhaustive;
      throw new Error(`Unhandled filter op: ${(p as { op: string }).op}`);
    }
  }
}

/** JSONB-path predicate. */
function jsonbPredicate(f: ResolvedFilter): SQL {
  const column = identifier(f.column);
  const path = f.jsonbPath ?? [];
  const p = f.parsed;

  if (p.op === "hasKey") {
    if (path.length === 0) {
      return sql`${column} \? ${p.value}`;
    }
    return sql`${column} #> ${pathLiteral(path)}::text[] \? ${p.value}`;
  }

  const textAccess = sql`${column} #>> ${pathLiteral(path)}::text[]`;
  switch (p.op) {
    case "eq":
      return sql`${textAccess} = ${String(p.value)}`;
    case "ne":
      return sql`${textAccess} <> ${String(p.value)}`;
    case "gt":
      return sql`(${textAccess})::numeric > ${Number(p.value)}`;
    case "gte":
      return sql`(${textAccess})::numeric >= ${Number(p.value)}`;
    case "lt":
      return sql`(${textAccess})::numeric < ${Number(p.value)}`;
    case "lte":
      return sql`(${textAccess})::numeric <= ${Number(p.value)}`;
    default:
      throw new Error(`JSONB path op not supported in v1 applier: ${p.op}`);
  }
}

/** Build the Postgres text[] literal for a JSONB path: `{"a","b"}`. */
function pathLiteral(segments: string[]): string {
  return `{${segments.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(",")}}`;
}

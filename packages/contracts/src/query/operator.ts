/**
 * Filter operator catalog.
 *
 * The wire format is PostgREST-shaped: each query value is `op.value` (e.g.
 * `?standing=eq.owner`). Bare values (no `op.` prefix) default to `eq`. The
 * `in` operator groups with parens: `in.(a,b,c)`. JSONB path filters use the
 * Postgres arrow syntax on the key (`?properties->meta->version=gte.2`).
 *
 * The single source of truth for which operators exist and how their values
 * parse. `drizzle/filter.apply.ts` reads the same catalogue to emit SQL.
 */

/** The set of operators a column can declare in its `ops` list. */
export type FilterOp =
  // Equality.
  | "eq"
  | "ne"
  // Comparison (orderable types only — string, number, date).
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  // Set membership.
  | "in"
  | "nin"
  // String patterns. `like` / `ilike` use raw SQL LIKE syntax (`%`, `_`)
  // and are case-sensitive / case-insensitive respectively. `startsWith`,
  // `endsWith`, `contains` are ergonomic wrappers that escape the LIKE
  // metacharacters in the value and default to case-INsensitive (ILIKE).
  // Add `*Cs` variants only when a real case asks for case-sensitive.
  | "like"
  | "ilike"
  | "startsWith"
  | "endsWith"
  | "contains"
  // JSONB-only.
  | "hasKey";

export const ALL_FILTER_OPS = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "nin",
  "like",
  "ilike",
  "startsWith",
  "endsWith",
  "contains",
  "hasKey",
] as const satisfies readonly FilterOp[];

/**
 * What a column field's value type narrows down to after the wire op-prefix
 * is parsed. The framework coerces the raw URL string to this type per the
 * spec's declared `valueType`.
 */
export type FilterValueType = "string" | "number" | "uuid" | "date" | "boolean";

/**
 * After parsing, `startsWith` / `endsWith` / `contains` collapse into
 * `ilike` (the parser compiles them to a LIKE pattern with metacharacters
 * escaped). The applier therefore never sees the ergonomic-string ops.
 */
export type PostParseOp = Exclude<
  FilterOp,
  "startsWith" | "endsWith" | "contains"
>;

/**
 * A parsed filter value carries its (post-parse) op + a typed RHS. For `in` /
 * `nin` the RHS is an array; `hasKey` is always a string; all other ops
 * carry a single scalar.
 */
export type ParsedFilter =
  | {
      op: Exclude<PostParseOp, "in" | "nin" | "hasKey">;
      value: string | number | boolean | Date;
    }
  | { op: "in" | "nin"; value: (string | number | boolean | Date)[] }
  | { op: "hasKey"; value: string };

/**
 * Which ops are list-valued. Used by the parser to apply the
 * `in.(a,b,c)` grouping rule.
 */
export const LIST_OPS = new Set<FilterOp>(["in", "nin"]);

/**
 * One example wire value per (op, valueType). Used by the OpenAPI integration
 * (`ApiFilterQueries`) to populate Scalar's per-parameter examples dropdown so
 * users see concrete values they can click rather than reading prose. Keep
 * the labels short — they show up in a compact dropdown.
 */
export interface OpExample {
  /** Compact label shown in Scalar's dropdown. */
  summary: string;
  /** Formatted wire value. */
  value: string;
}

const SAMPLES: Record<FilterValueType, string> = {
  string: "value",
  number: "5",
  uuid: "00000000-0000-0000-0000-000000000001",
  date: "2026-01-01",
  boolean: "true",
};

const STRING_SAMPLE = "value";

export function exampleFor(
  op: FilterOp,
  valueType: FilterValueType
): OpExample {
  const v = SAMPLES[valueType];
  switch (op) {
    case "eq":
      return { summary: "equals", value: `eq.${v}` };
    case "ne":
      return { summary: "not equals", value: `ne.${v}` };
    case "gt":
      return { summary: "greater than", value: `gt.${v}` };
    case "gte":
      return { summary: "at least", value: `gte.${v}` };
    case "lt":
      return { summary: "less than", value: `lt.${v}` };
    case "lte":
      return { summary: "at most", value: `lte.${v}` };
    case "in":
      return { summary: "one of (parens required)", value: `in.(${v},${v})` };
    case "nin":
      return { summary: "none of (parens required)", value: `nin.(${v})` };
    case "like":
      return {
        summary: "LIKE (% _ metacharacters)",
        value: `like.${STRING_SAMPLE}%`,
      };
    case "ilike":
      return {
        summary: "case-insensitive LIKE",
        value: `ilike.${STRING_SAMPLE}%`,
      };
    case "startsWith":
      return {
        summary: "case-insensitive prefix",
        value: `startsWith.${STRING_SAMPLE}`,
      };
    case "endsWith":
      return {
        summary: "case-insensitive suffix",
        value: `endsWith.${STRING_SAMPLE}`,
      };
    case "contains":
      return {
        summary: "case-insensitive substring",
        value: `contains.${STRING_SAMPLE}`,
      };
    case "hasKey":
      return { summary: "JSONB has key", value: `hasKey.${STRING_SAMPLE}` };
    default:
      throw new Error(`Unhandled filter op: ${String(op)}`);
  }
}

/**
 * The operator vocabulary as a set, for the parser's membership check. Derived
 * rather than restated, so a new operator cannot be half-added.
 */
export const ALL_OPS_SET: ReadonlySet<FilterOp> = new Set(ALL_FILTER_OPS);

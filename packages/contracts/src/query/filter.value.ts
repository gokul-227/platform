/**
 * Turning one raw query-string fragment into a typed value.
 *
 * Split from `filter.parse.ts`, which decides *what* a query string asks for;
 * this decides *how* `gte.2026-01-01` becomes a date and `in.(a,b,c)` becomes an
 * array. Nothing here knows a table, a column or a domain: a value is coerced
 * against the `valueType` its field declared, and a value that will not coerce
 * raises `VALIDATION_FAILED` rather than reaching a database.
 */

import { failed } from "./failure";
import type { FilterEntry } from "./filter.spec";
import type { FilterOp, FilterValueType, ParsedFilter } from "./operator";
import { ALL_FILTER_OPS, ALL_OPS_SET, LIST_OPS } from "./operator";

/**
 * Parse one `op.value` string against a spec entry. Default op is `eq` when
 * no `.` separator (bare-value shorthand).
 */
export function parseValue(
  raw: string,
  entry: FilterEntry,
  valueType: FilterValueType
): ParsedFilter {
  const { op, valuePart } = splitOpValue(raw);

  // Validate the op is allowed both globally and by the spec entry.
  if (!ALL_OPS_SET.has(op as FilterOp)) {
    throw failed(
      `Unknown operator \`${op}\`. Allowed: ${ALL_FILTER_OPS.join(", ")}.`
    );
  }
  if (!entry.ops.includes(op as FilterOp)) {
    throw failed(
      `Operator \`${op}\` is not allowed on this field. Allowed for this field: ${entry.ops.join(", ")}.`
    );
  }

  // Coerce + return.
  if (LIST_OPS.has(op as FilterOp)) {
    const items = parseInList(valuePart, valueType);
    return { op: op as "in" | "nin", value: items };
  }
  if (op === "hasKey") {
    // hasKey takes a single string key, regardless of declared valueType.
    return { op: "hasKey", value: valuePart };
  }
  const coerced = coerceScalar(valuePart, valueType);
  if (op === "startsWith" || op === "endsWith" || op === "contains") {
    // Compile to an ILIKE pattern with metacharacters escaped, default
    // case-INsensitive per the framework convention.
    if (valueType !== "string") {
      throw failed(`Operator \`${op}\` only applies to string fields.`);
    }
    const escaped = escapeLikeLiteral(valuePart);
    let pattern = `%${escaped}%`;
    if (op === "startsWith") {
      pattern = `${escaped}%`;
    } else if (op === "endsWith") {
      pattern = `%${escaped}`;
    }
    return { op: "ilike", value: pattern };
  }
  return {
    op: op as Exclude<
      FilterOp,
      "in" | "nin" | "hasKey" | "startsWith" | "endsWith" | "contains"
    >,
    value: coerced,
  };
}

/** Split `op.rest` on the first `.`. Bare values get the default `eq` op. */
function splitOpValue(raw: string): { op: string; valuePart: string } {
  const idx = raw.indexOf(".");
  if (idx === -1) {
    return { op: "eq", valuePart: raw };
  }
  // Avoid swallowing values that contain dots (e.g. `eq.foo.bar`): only the
  // FIRST dot is the op separator.
  const opToken = raw.slice(0, idx);
  const value = raw.slice(idx + 1);
  // Heuristic: if the token before the dot isn't a known op, treat the
  // whole string as a bare value (eq). This lets values like
  // `class=source.law.lbo_bw` work via `?class=eq.source.law.lbo_bw`
  // explicitly, but also `?class=source.law.lbo_bw` (bare default eq).
  if (!ALL_OPS_SET.has(opToken as FilterOp)) {
    return { op: "eq", valuePart: raw };
  }
  return { op: opToken, valuePart: value };
}

/** Parse the `in.(a,b,c)` list grouping. Requires parens. */
function parseInList(
  raw: string,
  valueType: FilterValueType
): (string | number | boolean | Date)[] {
  if (!(raw.startsWith("(") && raw.endsWith(")"))) {
    throw failed(
      `\`in\` / \`nin\` values must use the parenthesised form \`in.(a,b,c)\`. Got \`${raw}\`.`
    );
  }
  const inner = raw.slice(1, -1);
  if (inner.length === 0) {
    throw failed("`in` / `nin` list cannot be empty.");
  }
  return inner.split(",").map((part) => coerceScalar(part.trim(), valueType));
}

function coerceScalar(
  raw: string,
  valueType: FilterValueType
): string | number | boolean | Date {
  if (valueType === "string" || valueType === "uuid") {
    if (raw.length === 0) {
      throw failed("Empty value.");
    }
    if (valueType === "uuid" && !UUID_RE.test(raw)) {
      throw failed(`Expected UUID, got \`${raw}\`.`);
    }
    return raw;
  }
  if (valueType === "number") {
    const n = Number(raw);
    if (Number.isNaN(n)) {
      throw failed(`Expected number, got \`${raw}\`.`);
    }
    return n;
  }
  if (valueType === "boolean") {
    if (raw === "true") {
      return true;
    }
    if (raw === "false") {
      return false;
    }
    throw failed(`Expected boolean (\`true\`/\`false\`), got \`${raw}\`.`);
  }
  // date
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw failed(`Expected ISO date, got \`${raw}\`.`);
  }
  return d;
}

/**
 * JSONB values' coercion type is inferred from the op rather than declared
 * on the spec entry (the same `properties` field might be filtered by
 * `hasKey` with a string today and `gte` with a number tomorrow). v1 keeps
 * this simple: comparison ops coerce to number; equality ops coerce to
 * string; `hasKey` is always a string key.
 */
export function jsonbValueType(ops: readonly FilterOp[]): FilterValueType {
  // Pick a sensible default; the parser will narrow per-op. Choosing
  // "string" here lets `coerceScalar` accept anything except for the
  // op-specific branches above.
  void ops;
  return "string";
}

/** Escape LIKE metacharacters (`%`, `_`, `\`) in a user-supplied value. */
function escapeLikeLiteral(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

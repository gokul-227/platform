/**
 * Parse a single wire filter value (`op.value`) plus the multi-key sort
 * input (`field:dir`).
 *
 * Wire grammar:
 *
 *   ?standing=eq.owner                 => op: "eq",    value: "owner"
 *   ?standing=owner                    => op: "eq",    value: "owner"   (bare shorthand)
 *   ?standing=in.(owner,manager,editor) => op: "in",   value: ["owner","manager","editor"]
 *   ?email=startsWith.marius           => op: "ilike", value: "marius%" (ILIKE; case-insensitive)
 *   ?createdAt=gte.2026-01-01          => op: "gte",   value: Date
 *   ?properties->meta->version=gte.2
 *                                      => jsonbPath "meta.version", op: "gte", value: 5
 *
 *   ?sort=createdAt:desc&sort=email:asc => [{ field: "createdAt", dir: "desc" }, ...]
 *
 * The parser is intentionally strict about the spec: an op the spec didn't
 * declare for that field is rejected with `ValidationErrors.FAILED`, even
 * if the op is in the global catalog. Same for sorts on non-sortable fields.
 */

import { failed } from "./failure";
import type { FilterSpec } from "./filter.spec";
import { columnFor, sortableFields } from "./filter.spec";
import { jsonbValueType, parseValue } from "./filter.value";
import type { ParsedFilter } from "./operator";

/**
 * A field's filter as the applier consumes it: the resolved column
 * path (with table alias if the spec overrode it), the parsed op, and the
 * typed value. JSONB-path entries are flagged with a `path` for `#>>` /
 * `#>` walking.
 */
export interface ResolvedFilter {
  /** Column path the applier resolves; e.g. `user.email` or `createdAt`. */
  column: string;
  /** The wire field name (matches the spec key). */
  field: string;
  /** For JSONB-path filters, the dot-separated path under the column. */
  jsonbPath?: string[];
  /** The parsed filter (op + RHS). */
  parsed: ParsedFilter;
  /** The spec entry's type, so the applier knows whether to emit a JSONB walk. */
  type: "column" | "jsonbPath";
}

export interface ResolvedSort {
  column: string;
  dir: "asc" | "desc";
  field: string;
}

/**
 * Walk the spec, look up each declared field in `input`, and produce one
 * `ResolvedFilter` per non-empty value. Unknown query keys are ignored
 * (other parts of the schema like `limit`/`cursor` live there too).
 */
export function parseFilters<T extends FilterSpec>(
  spec: T,
  input: Record<string, unknown>
): ResolvedFilter[] {
  const out: ResolvedFilter[] = [];
  for (const [field, entry] of Object.entries(spec)) {
    if (entry.type === "jsonbPath") {
      // JSONB-path filters: wire key is either the bare field name (operates
      // on the whole JSON value, e.g. `?properties=hasKey.meta` for a
      // top-level key probe) or `field->seg1->seg2=op.value` (operates at
      // the path). The schema generator emits one zod string per field
      // name so the bare form passes through zod cleanly; the arrow form
      // arrives as extra unknown keys we scan for here.
      for (const [key, raw] of Object.entries(input)) {
        if (typeof raw !== "string" || raw.length === 0) {
          continue;
        }
        let path: string[];
        if (key === field) {
          path = [];
        } else if (key.startsWith(`${field}->`)) {
          path = key.slice(field.length + 2).split("->");
          if (path.some((seg) => seg.length === 0)) {
            throw failed(
              `Invalid JSONB path in \`${key}\`: empty path segments are not allowed.`
            );
          }
        } else {
          continue;
        }
        const parsed = parseValue(raw, entry, jsonbValueType(entry.ops));
        out.push({
          field,
          column: columnFor(field, entry),
          type: "jsonbPath",
          jsonbPath: path,
          parsed,
        });
      }
      continue;
    }

    const raw = input[field];
    if (typeof raw !== "string" || raw.length === 0) {
      continue;
    }
    const parsed = parseValue(raw, entry, entry.valueType);
    out.push({
      field,
      column: columnFor(field, entry),
      type: "column",
      parsed,
    });
  }
  return out;
}

/**
 * Parse the `sort` field of a list input against the spec's sortable
 * declarations. Input is the schema-coerced shape: either `undefined`, a
 * single string, or an array of strings (the schema's union normalizes
 * the single-string case into a one-element array on transform).
 */
export function parseSort<T extends FilterSpec>(
  spec: T,
  raw: unknown
): ResolvedSort[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  let arr: string[] = [];
  if (Array.isArray(raw)) {
    arr = raw.filter((v): v is string => typeof v === "string");
  } else if (typeof raw === "string") {
    arr = [raw];
  }

  const allowed = new Set(sortableFields(spec));
  const out: ResolvedSort[] = [];
  for (const token of arr) {
    const parts = token.split(":");
    if (parts.length !== 2) {
      throw failed(
        `Invalid sort token \`${token}\`: expected \`field:asc|desc\`.`
      );
    }
    const [field, dir] = parts as [string, string];
    if (!allowed.has(field)) {
      throw failed(
        `Field \`${field}\` is not sortable. Sortable fields: ${[...allowed].join(", ") || "(none)"}.`
      );
    }
    if (dir !== "asc" && dir !== "desc") {
      throw failed(
        `Invalid sort direction \`${dir}\` on \`${field}\`: expected \`asc\` or \`desc\`.`
      );
    }
    const entry = spec[field];
    if (!entry) {
      // Shouldn't happen — `allowed` was derived from the spec — but the
      // narrowing keeps TS happy and guards against future refactors.
      throw failed(`Sort field \`${field}\` is not declared in the spec.`);
    }
    out.push({ field, column: columnFor(field, entry), dir });
  }
  return out;
}

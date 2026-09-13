/**
 * Generate the zod fragment that a list-input schema merges in.
 *
 * For each filter field declared in the spec, we emit one optional string
 * (the wire value carries the `op.value` prefix; operator validation and
 * type coercion happen in the server-side applier, not at the zod boundary).
 * Keeping the schema purely string-typed has three wins:
 *
 *   1. OpenAPI renders each filter as one named query parameter, not the
 *      cartesian product of (field, op) pairs.
 *   2. The schema's job stays "did the client send a string?" — actual
 *      semantics live where the SQL lives.
 *   3. Error messages from the applier can describe the field + reason
 *      ("expected ISO date, got 'banana'") instead of being lost inside a
 *      zod refinement.
 *
 * The optional `sort` field is generated via `sortSchema(spec)` which builds
 * an enum over the spec's `sortable: true` fields. Repeatable (multi-key)
 * via the same string-array-or-string trick we use for property projection
 * in graph.
 */

import { z } from "zod";

import type { FilterEntry, FilterSpec } from "./filter.spec";
import { sortableFields } from "./filter.spec";

/**
 * Build a `z.object({...})`-shaped fragment to merge into a list-input
 * schema. Each spec field becomes `z.string().optional()` with the spec's
 * description carried through.
 *
 *   export const orgMemberListInputSchema = z
 *     .object({ limit: z.coerce.number()...optional(), cursor: z.string().optional() })
 *     .merge(filtersToSchema(orgMemberFilters));
 */
export function filtersToSchema<T extends FilterSpec>(
  spec: T
): z.ZodObject<{ [K in keyof T]: z.ZodOptional<z.ZodString> }> {
  const shape = {} as { [K in keyof T]: z.ZodOptional<z.ZodString> };
  for (const [name, entry] of Object.entries(spec)) {
    shape[name as keyof T] = wireString(entry).optional();
  }
  return z.object(shape);
}

/**
 * The wire schema for a single filter value. One string with a description
 * pointing at the allowed ops + the PostgREST-style `op.value` convention.
 * The description ends up in OpenAPI so consumers see the supported ops
 * on each parameter.
 */
function wireString(entry: FilterEntry): z.ZodString {
  const allowed = entry.ops.join(", ");
  const opNote =
    `PostgREST-style \`op.value\`. Supported ops: ${allowed}. ` +
    "Bare values default to `eq` (e.g. `?field=value` = `?field=eq.value`). " +
    "List ops use parens: `in.(a,b,c)`.";
  const desc = entry.description ? `${entry.description} ${opNote}` : opNote;
  return z.string().describe(desc);
}

/**
 * Sort schema for the spec — `?sort=field:asc|desc`, repeatable. Accepts
 * either an array of `field:dir` strings or a single one (Express delivers
 * a string when the query param appears once and an array when repeated).
 * When the spec has no sortable fields, returns `z.never()` so accidental
 * use yields a clear validation error.
 *
 * The string format is parsed in the server-side applier; this schema's
 * only job is to admit well-shaped values to the input.
 */
export function sortSchema<T extends FilterSpec>(spec: T) {
  const fields = sortableFields(spec);
  if (fields.length === 0) {
    return z
      .never()
      .describe("No sortable fields declared on this resource.")
      .optional();
  }
  const allowed = fields.map((f) => `\`${f}\``).join(", ");
  const single = z
    .string()
    .min(1)
    .describe(
      "Sort key in the form `field:asc|desc` (e.g. `createdAt:desc`). " +
        `Sortable fields: ${allowed}. Repeat the query param for multi-key sort.`
    );
  return z.union([z.array(single), single.transform((s) => [s])]);
}

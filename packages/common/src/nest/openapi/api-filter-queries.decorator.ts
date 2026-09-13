/**
 * Render `@ApiQuery` parameters from a filter spec.
 *
 * Background: `@nestjs/swagger`'s default `@Query() input: SomeDto` form does
 * not expand the DTO into per-field query parameters. `nestjs-zod`'s
 * `patchNestJsSwagger()` patches body / response schema handling but doesn't
 * cover query-parameter extraction, so a controller method using
 * `@Query() input: OrgMemberListDto` would silently produce zero query
 * parameters in the OpenAPI document — the runtime validation still works,
 * but Scalar / Swagger UI show no filter UI.
 *
 * This decorator closes the gap. Apply it on a list handler alongside
 * `@Query()`:
 *
 *   @Get()
 *   @ApiFilterQueries(orgMemberFilters)
 *   list(@Param("orgId") orgId: string, @Query() input: OrgMemberListDto) { ... }
 *
 * For each declared filter field it emits an `@ApiQuery` carrying the spec's
 * description as-is plus one OpenAPI `example` per declared op (Scalar
 * renders these as a clickable dropdown of concrete values — `eq.value`,
 * `in.(a,b)`, `startsWith.x`, etc.). The shared `op.value` wire grammar
 * (bare-value shorthand, parens for `in.(...)`, ILIKE defaults) lives ONCE
 * in the top-level OpenAPI `info.description` set by `apps/api/src/main.ts`
 * so it isn't repeated on every parameter.
 *
 * The decorator is additive: applying it does not change runtime behaviour
 * (the validation pipe still reads from the zod schema on the DTO). It
 * only affects the generated OpenAPI document.
 */

import {
  exampleFor,
  type FilterEntry,
  type FilterSpec,
  type FilterValueType,
} from "@aec-craft/platform-contracts";
import { applyDecorators } from "@nestjs/common";
import { ApiQuery } from "@nestjs/swagger";

export function ApiFilterQueries(
  spec: FilterSpec,
  options?: { omit?: readonly string[] }
): MethodDecorator & ClassDecorator {
  const decorators: (MethodDecorator & ClassDecorator)[] = [];
  const omit = new Set(options?.omit ?? []);

  const sortableNames: string[] = [];
  for (const [name, entry] of Object.entries(spec)) {
    if (omit.has(name)) {
      continue;
    }
    if (entry.sortable === true) {
      sortableNames.push(name);
    }
    decorators.push(
      ApiQuery({
        name,
        required: false,
        type: String,
        description: entry.description ?? "",
        examples: buildExamples(entry),
      })
    );
  }

  if (sortableNames.length > 0) {
    const fields = sortableNames.map((f) => `\`${f}\``).join(", ");
    decorators.push(
      ApiQuery({
        name: "sort",
        required: false,
        type: String,
        isArray: true,
        description: `Sortable fields: ${fields}.`,
        examples: {
          asc: { summary: "ascending", value: `${sortableNames[0]!}:asc` },
          desc: { summary: "descending", value: `${sortableNames[0]!}:desc` },
        },
      })
    );
  }

  return applyDecorators(...decorators);
}

/**
 * Build the `examples` map for a filter entry — one per declared op. The
 * key is the op name (so Scalar's dropdown shows `eq`, `startsWith`, etc.
 * as the entries); the value is the formatted example value with a short
 * summary. JSONB-path entries default their sample type to string since the
 * wire's path syntax is independent of the value type.
 */
function buildExamples(
  entry: FilterEntry
): Record<string, { summary: string; value: string }> {
  const valueType: FilterValueType =
    entry.type === "column" ? entry.valueType : "string";
  const out: Record<string, { summary: string; value: string }> = {};
  for (const op of entry.ops) {
    const ex = exampleFor(op, valueType);
    out[op] = { summary: ex.summary, value: ex.value };
  }
  return out;
}

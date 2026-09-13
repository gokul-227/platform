import { capabilityBlocksSchema } from "@aec-craft/platform-contracts";
import type { z } from "zod";

/**
 * Rendered from the zod schemas so the prompt cannot drift from them: one block
 * per line, `envelope: areaGross, areaNet, ...`, nested groups as dotted paths.
 * Introspection reads `_def.typeName` rather than using `instanceof`, so it
 * survives a duplicated zod instance across package boundaries.
 */

const MAX_FIELD_DEPTH = 3;

type AnyZod = z.ZodTypeAny;

function typeNameOf(schema: AnyZod): string {
  return (schema._def as { typeName?: string }).typeName ?? "";
}

/** Strip Optional / Nullable / Default wrappers down to the value schema. */
function unwrap(schema: AnyZod): AnyZod {
  let current = schema;
  for (;;) {
    const def = current._def as { innerType?: AnyZod };
    const name = typeNameOf(current);
    if (
      (name === "ZodOptional" ||
        name === "ZodNullable" ||
        name === "ZodDefault") &&
      def.innerType
    ) {
      current = def.innerType;
    } else {
      return current;
    }
  }
}

function shapeOf(schema: AnyZod): Record<string, AnyZod> | null {
  if (typeNameOf(schema) !== "ZodObject") {
    return null;
  }
  return (schema as z.AnyZodObject).shape;
}

function leafPaths(
  schema: AnyZod,
  prefix: string,
  depth: number,
  out: string[]
): void {
  const shape = shapeOf(schema);
  if (!shape || depth >= MAX_FIELD_DEPTH) {
    if (prefix) {
      out.push(prefix);
    }
    return;
  }
  for (const [key, field] of Object.entries(shape)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const inner = unwrap(field);
    if (shapeOf(inner)) {
      leafPaths(inner, path, depth + 1, out);
    } else {
      out.push(path);
    }
  }
}

export function describeCapabilityBlocks(): string {
  const blocks = shapeOf(capabilityBlocksSchema as AnyZod) ?? {};
  const lines: string[] = [];
  for (const [block, schema] of Object.entries(blocks)) {
    const paths: string[] = [];
    leafPaths(unwrap(schema), "", 0, paths);
    lines.push(
      paths.length > 0
        ? `${block}: ${paths.join(", ")}`
        : `${block}: (free-form keys)`
    );
  }
  return lines.join(". ");
}

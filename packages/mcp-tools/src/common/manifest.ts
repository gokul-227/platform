/**
 * Build the MCP-protocol `tools/list` payload from a set of descriptors.
 *
 * The MCP wire shape is `{ tools: [{ name, description, inputSchema }] }`,
 * where `inputSchema` is JSON Schema (draft-07-ish). zod is the source of
 * truth on the descriptor; `zod-to-json-schema` converts at manifest-build
 * time. Conversion is pure + deterministic so the same input always yields
 * the same JSON Schema; the endpoint calls this once at boot and caches.
 *
 * Outputs are intentionally not in the MCP wire shape — MCP's tool-call
 * response is `content` (text / image / etc.), not a typed JSON Schema. We
 * still validate the resource server's response against the descriptor's
 * `outputSchema` before serializing to MCP content; that's a dispatch-side
 * concern, not a manifest concern.
 */

import type { FilterSpec } from "@aec-craft/platform-contracts";
import type { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

import type { ToolDescriptor } from "./descriptor";

export interface McpToolManifestEntry {
  readonly description: string;
  /** JSON Schema (draft-07-ish) derived from the descriptor's zod inputSchema. */
  readonly inputSchema: Record<string, unknown>;
  readonly name: string;
}

export interface McpToolsListPayload {
  readonly tools: readonly McpToolManifestEntry[];
}

/** Convert a single descriptor to its MCP-wire manifest entry. */
export function descriptorToManifestEntry(
  descriptor: ToolDescriptor
): McpToolManifestEntry {
  const inputSchema = zodToJsonSchema(descriptor.inputSchema, {
    target: "openApi3",
    $refStrategy: "none",
  }) as Record<string, unknown>;
  const description = [
    descriptor.description,
    describeResponseEnvelope(descriptor.outputSchema),
    descriptor.filterSpec ? describeFilterSpec(descriptor.filterSpec) : "",
  ]
    .filter((part) => part !== "")
    .join("\n\n");
  return {
    name: descriptor.name,
    description,
    inputSchema,
  };
}

/** Convert the full descriptor list to the MCP `tools/list` payload. */
export function buildToolsListPayload(
  descriptors: readonly ToolDescriptor[]
): McpToolsListPayload {
  return { tools: descriptors.map(descriptorToManifestEntry) };
}

/**
 * Render a FilterSpec as a compact, deterministic prose line the agent
 * can read alongside the tool description. Pattern:
 *
 *   Filters: type (eq, in); class (eq, startsWith, in); properties (hasKey, eq, gte, lte).
 *   Sortable: createdAt, name.
 *
 * The PostgREST `op.value` grammar itself is in the endpoint's
 * `serverInfo.instructions` (loaded once per session); this line is the
 * tool-specific field-level allow-list. Exported separately so other
 * downstream renderers (Scalar, docs codegen) can reuse the same prose.
 */
export function describeFilterSpec(spec: FilterSpec): string {
  const filterParts: string[] = [];
  const sortable: string[] = [];
  for (const [name, entry] of Object.entries(spec)) {
    filterParts.push(`${name} (${entry.ops.join(", ")})`);
    if (entry.sortable === true) {
      sortable.push(name);
    }
  }
  let line =
    filterParts.length > 0 ? `Filters: ${filterParts.join("; ")}.` : "";
  if (sortable.length > 0) {
    if (line) {
      line += " ";
    }
    line += `Sortable: ${sortable.join(", ")}.`;
  }
  return line;
}

/**
 * Render the response envelope as a line the agent can read.
 *
 *   Returns `{ items, nextCursor?, page, pageSize, total, totalPages }`.
 *
 * Derived rather than written by hand. Ten tool descriptions claimed
 * "Returns `{ items, nextCursor }`" and every one of them went stale the day
 * lists gained offset pagination: the field is still there but it is optional
 * now, beside four others nobody updated the prose for.
 *
 * Only top-level object shapes are described. A union answer (a Cypher result,
 * a routing answer) has no single field list, and a made-up one would be worse
 * than none.
 */
export function describeResponseEnvelope(schema: z.ZodTypeAny): string {
  const shape = (schema as { shape?: Record<string, z.ZodTypeAny> }).shape;
  if (!shape || typeof shape !== "object") {
    return "";
  }
  const fields = Object.entries(shape).map(([name, field]) =>
    field.isOptional() ? `${name}?` : name
  );
  if (fields.length === 0) {
    return "";
  }
  return `Returns \`{ ${fields.sort().join(", ")} }\`.`;
}

import { z } from "zod";

/**
 * Shared wire shapes for the metadata KV sub-resource, reused by the user/org/
 * project `PUT|DELETE …/metadata/:keyPath` routes. `keyPath` is a dotted path
 * (`apps.platform.x` → `{apps:{platform:{x}}}`), so keys can't contain a literal
 * `.`. Namespacing under `apps.<appId>.*` is convention, not enforced — the bag
 * is stored as-is, and apps are responsible for not colliding.
 */
export const metadataKeyPathSchema = z
  .string()
  .min(1)
  .describe(
    "Dotted key path into the metadata bag, e.g. `apps.platform.theme`. Segments are " +
      "separated by `.`; missing parents are created on write. App settings live under " +
      "`apps.<appId>.*` by convention."
  );

/**
 * Any JSON value. The branches are flat rather than recursive on purpose: the
 * MCP manifest converts with `$refStrategy: "none"`, which cannot express a
 * self-reference, so a recursive union emits this exact schema anyway and warns
 * at every boot. Nested values stay unconstrained, which is what the graph
 * `properties` bag already does and what survives the MCP transport intact; a
 * field with no declared type at all does not, and is stored as its own JSON
 * text instead.
 */
export const metadataValueSchema = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.unknown()),
    z.record(z.string(), z.unknown()),
  ])
  .nullable();

export const setMetadataInputSchema = z
  .object({
    value: metadataValueSchema.describe(
      "JSON value to store at the key path. Any JSON is accepted (scalar, object, array, " +
        "or null). It replaces whatever currently sits at the path; siblings are untouched."
    ),
  })
  .describe("Body for setting a metadata key.");

export type MetadataValue = z.infer<typeof metadataValueSchema>;
export type SetMetadataInput = z.infer<typeof setMetadataInputSchema>;

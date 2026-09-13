import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Interop block: format-neutral source identity, for round-trip idempotency and
 * viewer linkage, not classification. `sourceId` is the authoring tool's stable
 * id (IFC GUID, Revit UniqueId, APS objectId); with `format` it disambiguates
 * otherwise-identical ids across formats and is the basis for the deterministic
 * node id. Ontology cross-classification (BOT/BRICK) lives in the class
 * taxonomy, not here.
 */
export const interopSchema = z
  .object({
    format: z.string().optional(),
    source: z.string().optional(),
    sourceId: z.string().optional(),
    sourceClass: z.string().optional(),
    syncedVersion: z.string().optional(),
    raw: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type Interop = z.infer<typeof interopSchema>;

export const interopBlock = defineBlock({
  key: "interop",
  description: "Format-neutral source identity for round-trip and viewer link.",
  schema: interopSchema,
});

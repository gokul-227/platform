import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Provenance block: where this node came from and how far it is trusted.
 *
 * `quote` is denormalised deliberately. It is the excerpt a person reviewed at
 * a point in time and must not change when the parser improves.
 *
 * `reviewedAt` gates nothing. It decides the assurance a verdict reports and it
 * stops a re-run overwriting a rule somebody has already corrected.
 */
export const PROVENANCE_METHODS = [
  "llm",
  "human",
  "import",
  "derived",
] as const;

export const provenanceSchema = z
  .object({
    /** The `source` node this was read from. */
    sourceId: z.string().optional(),
    quote: z.string().optional(),
    instrument: z.string().optional(),
    article: z.string().optional(),
    revision: z.string().optional(),
    method: z
      .string()
      .min(1)
      .optional()
      .describe(`Canonical: ${PROVENANCE_METHODS.join(", ")}.`),
    confidence: z.number().min(0).max(1).optional(),
    reviewedBy: z.string().optional(),
    reviewedAt: z.string().optional(),
  })
  .passthrough();

export type Provenance = z.infer<typeof provenanceSchema>;

export const provenanceBlock = defineBlock({
  key: "provenance",
  description:
    "Origin and assurance: the source and quote it was read from, how it was made, who confirmed it.",
  schema: provenanceSchema,
});

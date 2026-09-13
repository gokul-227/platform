import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Enforcement block: how hard the rule bites and who may set it aside.
 *
 * No `modality` field. The dominant case is obligation, and a permission is
 * handled by the deviation record rather than by a fifth value nothing reads.
 */
export const ENFORCEMENT_SEVERITIES = [
  "mandatory",
  "recommended",
  "informative",
] as const;

export const enforcementSchema = z
  .object({
    severity: z
      .string()
      .min(1)
      .optional()
      .describe(`Canonical: ${ENFORCEMENT_SEVERITIES.join(", ")}.`),
    authority: z.string().optional(),
    canDeviate: z.boolean().optional(),
    /** The article a deviation would be granted under. */
    deviationBasis: z.string().optional(),
  })
  .passthrough();

export type Enforcement = z.infer<typeof enforcementSchema>;

export const enforcementBlock = defineBlock({
  key: "enforcement",
  description:
    "Severity, the authority that enforces it, and whether a deviation may be granted.",
  schema: enforcementSchema,
});

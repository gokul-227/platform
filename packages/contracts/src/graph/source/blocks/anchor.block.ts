import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Anchor block: how the bytes behind this unit are organised, and where in them
 * it sits. Format is its own axis, separate from genre (`class`) and depth
 * (`citation.level`), so a spreadsheet brief and a statute filter apart without
 * either concept having to absorb the other.
 */
export const ANCHOR_FORMATS = [
  "text",
  "pdf",
  "html",
  "spreadsheet",
  "drawing",
] as const;

export const anchorSchema = z
  .object({
    format: z
      .string()
      .min(1)
      .optional()
      .describe(`Canonical: ${ANCHOR_FORMATS.join(", ")}.`),
    page: z.number().int().min(1).optional(),
    /** Hash of the text this unit resolved to, for drift detection on re-upload. */
    textSha: z.string().optional(),
  })
  .passthrough();

export type Anchor = z.infer<typeof anchorSchema>;

export const anchorBlock = defineBlock({
  key: "anchor",
  description:
    "How the source bytes are organised and where in them this unit sits: format, page, text hash.",
  schema: anchorSchema,
});

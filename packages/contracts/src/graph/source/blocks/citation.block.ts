import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Citation block: the logical address of a citable unit.
 *
 * A source node is a spine and nothing more. The text, offsets and hashes stay
 * in `files-api`, because re-parsing a document is the most frequent operation
 * in the pipeline and it must write zero graph rows. `(fileId, path)` is the
 * join key back to the extracted unit.
 *
 * `level` is not in `class` because a paragraph and a sentence are the same kind
 * of thing at different granularity: one open vocabulary, suggested per genre.
 */
export const CITATION_LEVELS = [
  "act",
  "part",
  "chapter",
  "section",
  "paragraph",
  "subsection",
  "sentence",
  "item",
  "annex",
] as const;

export const citationSchema = z
  .object({
    fileId: z.string().optional(),
    level: z
      .string()
      .min(1)
      .optional()
      .describe(
        `Depth in the document's own structure. Suggested for a statute: ${CITATION_LEVELS.join(", ")}; a spreadsheet brief uses workbook, sheet, cell. Novel values are accepted and counted as drift.`
      ),
    /** Orders siblings; the statutory numeral, not an index. */
    ordinal: z.string().optional(),
    /** The address, `["34", "1", "2"]`, which joins the extracted unit. */
    path: z.array(z.string()).optional(),
  })
  .passthrough();

export type Citation = z.infer<typeof citationSchema>;

export const citationBlock = defineBlock({
  key: "citation",
  description:
    "The logical address of a citable unit: its file, its level, its ordinal, and the path that joins the extracted text.",
  schema: citationSchema,
});

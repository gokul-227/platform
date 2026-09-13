import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Publication block: who issued this and which revision it is. Separate from
 * `lifecycle`, which carries whether it is in force: a document can be
 * published and repealed, and both facts have to be readable.
 */
export const publicationSchema = z
  .object({
    publisher: z.string().optional(),
    jurisdiction: z.string().optional(),
    revision: z.string().optional(),
    publishedOn: z.string().optional(),
    inForceFrom: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough();

export type Publication = z.infer<typeof publicationSchema>;

export const publicationBlock = defineBlock({
  key: "publication",
  description:
    "Who issued the source, for which jurisdiction, in which revision, and from when it is in force.",
  schema: publicationSchema,
});

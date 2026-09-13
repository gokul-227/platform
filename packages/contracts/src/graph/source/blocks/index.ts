import { z } from "zod";
import {
  lifecycleBlock,
  lifecycleSchema,
  provenanceBlock,
  provenanceSchema,
} from "../../shared/blocks";
import { anchorBlock, anchorSchema } from "./anchor.block";
import { citationBlock, citationSchema } from "./citation.block";
import { publicationBlock, publicationSchema } from "./publication.block";

export * from "./anchor.block";
export * from "./citation.block";
export * from "./publication.block";

/** The blocks a source carries, in canonical order. */
export const SOURCE_BLOCKS = [
  citationBlock,
  anchorBlock,
  publicationBlock,
  lifecycleBlock,
  provenanceBlock,
] as const;

export type SourceBlockKey = (typeof SOURCE_BLOCKS)[number]["key"];

export const SOURCE_BLOCK_KEYS: readonly SourceBlockKey[] = SOURCE_BLOCKS.map(
  (block) => block.key
);

/** Opt-in per-block validation. The wire contract keeps `properties` open. */
export const sourceBlocksSchema = z
  .object({
    citation: citationSchema.optional(),
    anchor: anchorSchema.optional(),
    publication: publicationSchema.optional(),
    lifecycle: lifecycleSchema.optional(),
    provenance: provenanceSchema.optional(),
  })
  .passthrough();

export type SourceBlocks = z.infer<typeof sourceBlocksSchema>;

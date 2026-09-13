import { z } from "zod";
import {
  lifecycleBlock,
  lifecycleSchema,
  provenanceBlock,
  provenanceSchema,
} from "../../shared/blocks";
import { criterionBlock, criterionSchema } from "./criterion.block";
import { enforcementBlock, enforcementSchema } from "./enforcement.block";
import { selectorBlock, selectorSchema } from "./selector.block";

export * from "./criterion.block";
export * from "./enforcement.block";
export * from "./selector.block";

/** The blocks a rule carries, in canonical order. */
export const RULE_BLOCKS = [
  selectorBlock,
  criterionBlock,
  enforcementBlock,
  lifecycleBlock,
  provenanceBlock,
] as const;

export type RuleBlockKey = (typeof RULE_BLOCKS)[number]["key"];

export const RULE_BLOCK_KEYS: readonly RuleBlockKey[] = RULE_BLOCKS.map(
  (block) => block.key
);

/** Opt-in per-block validation. The wire contract keeps `properties` open. */
export const ruleBlocksSchema = z
  .object({
    selector: selectorSchema.optional(),
    criterion: criterionSchema.optional(),
    enforcement: enforcementSchema.optional(),
    lifecycle: lifecycleSchema.optional(),
    provenance: provenanceSchema.optional(),
  })
  .passthrough();

export type RuleBlocks = z.infer<typeof ruleBlocksSchema>;

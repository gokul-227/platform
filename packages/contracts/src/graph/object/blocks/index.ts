import { z } from "zod";
import { envelopeBlock, envelopeSchema } from "./envelope.block";
import { finishesBlock, finishesSchema } from "./finishes.block";
import { fireBlock, fireSchema } from "./fire.block";
import { geometryBlock, geometrySchema } from "./geometry.block";
import { interopBlock, interopSchema } from "./interop.block";
import { materialBlock, materialSchema } from "./material.block";
import { programmeBlock, programmeSchema } from "./programme.block";
import { stairBlock, stairSchema } from "./stair.block";
import { systemsBlock, systemsSchema } from "./systems.block";

export type { BlockDefinition } from "../../registry/block";
export { defineBlock } from "../../registry/block";
export { type Envelope, envelopeBlock, envelopeSchema } from "./envelope.block";
export { type Finishes, finishesBlock, finishesSchema } from "./finishes.block";
export { type Fire, fireBlock, fireSchema } from "./fire.block";
export { type Geometry, geometryBlock, geometrySchema } from "./geometry.block";
export { type Interop, interopBlock, interopSchema } from "./interop.block";
export { type Material, materialBlock, materialSchema } from "./material.block";
export {
  PROGRAMME_USES,
  type Programme,
  type ProgrammeUse,
  programmeBlock,
  programmeSchema,
} from "./programme.block";
export { type Stair, stairBlock, stairSchema } from "./stair.block";
export { type Systems, systemsBlock, systemsSchema } from "./systems.block";

/**
 * The capability blocks the platform ships, in canonical order. The key list
 * and the SDK descriptions derive from this registry; adding a block is a file
 * plus one entry here (and one line in the composed schema below, which keeps
 * per-block static types precise).
 */
export const BLOCKS = [
  envelopeBlock,
  programmeBlock,
  materialBlock,
  finishesBlock,
  systemsBlock,
  fireBlock,
  stairBlock,
  geometryBlock,
  interopBlock,
] as const;

export type CanonicalBlockKey = (typeof BLOCKS)[number]["key"];

/** The object blocks' keys. The public `CANONICAL_BLOCK_KEYS` is composed
 *  across every type in `../../vocabulary`. */
export const OBJECT_BLOCK_KEYS: readonly CanonicalBlockKey[] = BLOCKS.map(
  (block) => block.key
);

/**
 * The nine canonical blocks composed as an optional, passthrough bag:
 * unknown / project-specific blocks are preserved. Consumers that want per-block
 * validation (adapter, validator) opt in here; the wire contract keeps
 * `properties` open and does not enforce this.
 */
export const capabilityBlocksSchema = z
  .object({
    envelope: envelopeSchema.optional(),
    programme: programmeSchema.optional(),
    material: materialSchema.optional(),
    finishes: finishesSchema.optional(),
    systems: systemsSchema.optional(),
    fire: fireSchema.optional(),
    stair: stairSchema.optional(),
    geometry: geometrySchema.optional(),
    interop: interopSchema.optional(),
  })
  .passthrough();

export type CapabilityBlocks = z.infer<typeof capabilityBlocksSchema>;

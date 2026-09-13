import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Finishes block: surface treatments keyed by surface (floor, ceiling, wall.n).
 * Each value is a finish name or a descriptor object.
 */
export const finishesSchema = z.record(
  z.string(),
  z.union([z.string(), z.record(z.string(), z.unknown())])
);

export type Finishes = z.infer<typeof finishesSchema>;

export const finishesBlock = defineBlock({
  key: "finishes",
  description: "Surface treatments keyed by surface (floor, ceiling, wall).",
  schema: finishesSchema,
});

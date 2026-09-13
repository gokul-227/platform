import { z } from "zod";
import { defineBlock } from "../../registry/block";

const materialLayerSchema = z
  .object({
    material: z.string(),
    thickness: z.number().min(0).optional(),
    density: z.number().min(0).optional(),
    rValue: z.number().min(0).optional(),
    function: z.array(z.string()).optional(),
  })
  .passthrough();

const materialFinishSchema = z
  .object({
    face: z.string().optional(),
    finish: z.string(),
  })
  .passthrough();

/**
 * Material block: layer build-up, finishes, and performance. Jurisdiction-
 * specific performance metrics flow through as extra keys (passthrough).
 */
export const materialSchema = z
  .object({
    layers: z.array(materialLayerSchema).optional(),
    finishes: z.array(materialFinishSchema).optional(),
    performance: z
      .object({
        uValue: z.number().min(0).optional(),
        fireResistance: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type Material = z.infer<typeof materialSchema>;

export const materialBlock = defineBlock({
  key: "material",
  description: "Layer build-up, material references, and performance metrics.",
  schema: materialSchema,
});

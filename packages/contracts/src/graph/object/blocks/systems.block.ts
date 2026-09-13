import { z } from "zod";
import { defineBlock } from "../../registry/block";

// `present` is the only typed anchor; category detail passes through.
const systemCategorySchema = z
  .object({ present: z.boolean().optional() })
  .passthrough();

/**
 * Systems block: building services by category. Custom domain systems (e.g.
 * `medicalGas`) attach at the top level via passthrough.
 */
export const systemsSchema = z
  .object({
    hvac: z
      .object({
        heating: systemCategorySchema.optional(),
        cooling: systemCategorySchema.optional(),
        ventilation: systemCategorySchema.optional(),
      })
      .passthrough()
      .optional(),
    electrical: systemCategorySchema.optional(),
    lighting: systemCategorySchema.optional(),
    plumbing: systemCategorySchema.optional(),
    fire: systemCategorySchema.optional(),
    data: systemCategorySchema.optional(),
  })
  .passthrough();

export type Systems = z.infer<typeof systemsSchema>;

export const systemsBlock = defineBlock({
  key: "systems",
  description: "Building services by category (HVAC, electrical, plumbing, …).",
  schema: systemsSchema,
});

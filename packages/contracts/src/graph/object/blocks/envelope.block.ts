import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Envelope block: measurements and position, SI units. Passthrough keeps
 * project-specific measures; the typed fields are the common vocabulary.
 */
export const envelopeSchema = z
  .object({
    areaGross: z.number().min(0).optional(),
    areaNet: z.number().min(0).optional(),
    volumeGross: z.number().min(0).optional(),
    volumeNet: z.number().min(0).optional(),
    height: z.number().min(0).optional(),
    width: z.number().min(0).optional(),
    length: z.number().min(0).optional(),
    thickness: z.number().min(0).optional(),
    perimeter: z.number().min(0).optional(),
    elevation: z.number().optional(),
    orientation: z.string().optional(),
  })
  .passthrough();

export type Envelope = z.infer<typeof envelopeSchema>;

export const envelopeBlock = defineBlock({
  key: "envelope",
  description: "Spatial extent: areas, volumes, dimensions, position (SI).",
  schema: envelopeSchema,
});

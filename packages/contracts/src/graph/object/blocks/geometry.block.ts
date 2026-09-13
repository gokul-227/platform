import { z } from "zod";
import { defineBlock } from "../../registry/block";

// Scene space is Y-up (web-ifc / fragments): plan points live in world XZ,
// and `y` is reserved for the vertical.
const planPointSchema = z.object({ x: z.number(), z: z.number() });
const point3dSchema = z.object({ x: z.number(), y: z.number(), z: z.number() });
const ringSchema = z.array(planPointSchema).min(3);

// External geometry pointer (glTF/Draco/IFC in the bucket), not inline mesh.
const lodReferenceSchema = z
  .object({
    url: z.string(),
    format: z.string(),
    sizeBytes: z.number().int().min(0).optional(),
    checksum: z.string().optional(),
    generatedAt: z.string().optional(),
  })
  .passthrough();

/**
 * Geometry block: cheap inline spatial data (bbox, centroid, footprint,
 * elevation) plus external LOD references. The renderer loads meshes by LOD
 * ref; the inline fields power graph layout, HUD anchoring, and analyses.
 * `footprint.rings` is floor-plane world XZ (outer boundary first, then
 * holes); `source` records how it was derived (`"bbox"` rectangle vs `"mesh"`
 * boundary). `elevation` is the node's floor height (world Y).
 */
export const geometrySchema = z
  .object({
    bbox: z.object({ min: point3dSchema, max: point3dSchema }).optional(),
    centroid: point3dSchema.optional(),
    elevation: z.number().optional(),
    footprint: z
      .object({
        rings: z.array(ringSchema).min(1),
        source: z.string().optional(),
      })
      .optional(),
    orientation: z
      .object({
        compass: z.string().optional(),
        azimuth: z.number().min(0).optional(),
      })
      .optional(),
    lod0: lodReferenceSchema.optional(),
    lod1: lodReferenceSchema.optional(),
    lod2: lodReferenceSchema.optional(),
    lod3: lodReferenceSchema.optional(),
  })
  .passthrough();

export type Geometry = z.infer<typeof geometrySchema>;

export const geometryBlock = defineBlock({
  key: "geometry",
  description:
    "Inline spatial data (bbox, centroid, footprint, elevation) and external LOD refs.",
  schema: geometrySchema,
});

import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Fire block: resistance, reaction and the classifications German building law
 * keys most of its requirements off.
 *
 * `resistanceClass` is the European designation (`REI 90`) and `resistance` the
 * national one (`F90`, `EI30`); both are kept because a statute cites one and a
 * product declaration the other, and normalising at write time would lose which
 * was asserted.
 */
export const fireSchema = z
  .object({
    /** National designation: `F30`, `F90`, `EI30`. */
    resistance: z.string().nullish(),
    /** European designation: `REI 90`, `EI2 30-C`. */
    resistanceClass: z.string().nullish(),
    /** Reaction to fire: `nonCombustible`, `lowFlammability`, `normal` (A1..F). */
    reaction: z.string().nullish(),
    /** Gebäudeklasse 1..5, on a building. The classifying rule assigns it. */
    buildingClass: z.string().nullish(),
    isFireWall: z.boolean().nullish(),
    isFireBarrier: z.boolean().nullish(),
    /** Rated closing element in a fire-separating component. */
    isFireDoor: z.boolean().nullish(),
    /** Minutes, where a statute states a duration rather than a class. */
    resistanceMinutes: z.number().min(0).nullish(),
    compartmentId: z.string().nullish(),
  })
  .passthrough();

export type Fire = z.infer<typeof fireSchema>;

export const fireBlock = defineBlock({
  key: "fire",
  description:
    "Fire resistance and reaction, the building class rules key off, and fire-separating roles.",
  schema: fireSchema,
});

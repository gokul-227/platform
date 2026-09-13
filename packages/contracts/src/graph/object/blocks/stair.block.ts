import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Stair block: the dimensions a stair rule is written against.
 *
 * On the flight, not the assembly. `IfcStairFlight` carries these as direct
 * attributes and one stair's flights differ — the two runs of one Snowdon stair
 * are ten risers and nine — so a value on the assembly would average away the
 * thing the rule is about.
 *
 * The Landesbauordnung states none of these numerically: § 28 asks whether a
 * width is *sufficient*, and the figures come from DIN 18065. So these fields
 * exist to be read by hand-authored rules, and are populated whether or not any
 * statute is extracted.
 */
export const stairSchema = z
  .object({
    /** Rise of one step, in metres. DIN 18065 bounds it 0.14 to 0.19. */
    riserHeight: z.number().positive().nullish(),
    /** Going of one step, in metres. DIN 18065 bounds it 0.26 to 0.37. */
    treadLength: z.number().positive().nullish(),
    riserCount: z.number().int().positive().nullish(),
    treadCount: z.number().int().positive().nullish(),
    /**
     * Usable width, in metres: clear of handrails, which is what a statute means
     * by `nutzbare Breite` and not the same as the flight's overall width.
     */
    usableWidth: z.number().positive().nullish(),
    /** Straight, quarter-turn, half-turn, spiral, winder. */
    shape: z.string().nullish(),
    hasHandrail: z.boolean().nullish(),
    /** Handrails on both sides, which a width threshold makes mandatory. */
    hasHandrailBothSides: z.boolean().nullish(),
  })
  .passthrough();

export type Stair = z.infer<typeof stairSchema>;

export const stairBlock = defineBlock({
  key: "stair",
  description:
    "Step dimensions and handrails of a stair flight: the values DIN 18065 and the stair provisions of a building code are written against.",
  schema: stairSchema,
});

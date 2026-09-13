import { z } from "zod";

/**
 * `POST /projects/:projectId/analysis/chokepoints`
 *
 * Where circulation depends on a single passage or a single space.
 *
 * Not the same question as connectivity, and the difference is the basis of the
 * second-escape-route rule. Connectivity asks whether the building is one piece
 * now; this asks whether it is still one piece if one thing fails. A building can
 * pass the first perfectly and be maximally fragile — rooms off a corridor are
 * fully connected, and every one of them depends on that corridor.
 *
 * Deterministic, not probabilistic: it reports that a single-point dependency
 * exists, never how likely it is to be exercised. Fire code then treats the
 * dependency as certain, which is why a second escape route is required at all.
 */
export const chokepointsInputSchema = z.object({
  /** Narrow to one storey, asking the same question of a smaller graph. */
  parentId: z.string().uuid().optional(),
});

export type ChokepointsInput = z.infer<typeof chokepointsInputSchema>;

/** A passage whose loss splits its island: the only door into somewhere. */
export interface ChokepointPassage {
  fromId: string;
  /** How many spaces end up on the smaller side if this passage is lost. */
  stranded: number;
  toId: string;
}

/** A space you must pass through: the corridor everything behind it depends on. */
export interface ChokepointSpace {
  nodeId: string;
  /** How many spaces lose their connection to the rest if this one is impassable. */
  stranded: number;
}

export interface ChokepointsResponse {
  /** Spaces the analysis looked at. */
  examined: number;
  /** Passages that cannot be routed around, worst first. */
  passages: ChokepointPassage[];
  /**
   * True when no single passage or space carries the building. Note what it does
   * not mean: a model with no passages at all is trivially robust, so read it
   * next to `examined`.
   */
  robust: boolean;
  /** Spaces that cannot be passed around, worst first. */
  spaces: ChokepointSpace[];
}

/**
 * The response as a schema, so the route can publish it.
 *
 * Mirrors the interface above rather than replacing it.
 */
export const chokepointsResponseSchema = z.object({
  examined: z.number().int().nonnegative(),
  passages: z.array(
    z.object({
      fromId: z.string().uuid(),
      stranded: z.number().int().nonnegative(),
      toId: z.string().uuid(),
    })
  ),
  robust: z.boolean(),
  spaces: z.array(
    z.object({
      nodeId: z.string().uuid(),
      stranded: z.number().int().nonnegative(),
    })
  ),
});

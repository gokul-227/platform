import { z } from "zod";

/**
 * `POST /projects/:projectId/analysis/connectivity`
 *
 * Can you walk between every space.
 *
 * The precondition for everything in `circulation`: a travel distance means
 * nothing until the graph agrees two spaces are connected, and a space you cannot
 * walk into is almost always a door that was never modelled rather than a real
 * island.
 *
 * Spaces, and only spaces: `connectsTo` is declared space to space, because a
 * storey is a container rather than something you pass through. And that edge
 * alone, because it is the passable one by definition (a door, a virtual boundary
 * in open plan, an unfilled opening); walking `adjacentTo` instead would treat a
 * party wall as a doorway. Neither is a parameter: both would only let a caller
 * ask a question this analysis does not answer.
 */
export const connectivityInputSchema = z.object({
  /**
   * Narrow to one storey. Note what that means: two wings joined only through
   * another floor's stair are two islands *within* this storey, which is the right
   * answer to "is this floor walkable end to end" and the wrong answer to "is the
   * building".
   */
  parentId: z.string().uuid().optional(),
});

export type ConnectivityInput = z.infer<typeof connectivityInputSchema>;

/**
 * The spaces that do not all reach each other, and how many are cut off.
 *
 * `spaces` means a count of spaces here as it does above; the key it sits under is
 * what says which ones.
 */
export interface DisconnectedSpaces {
  /**
   * Node ids per island, largest first.
   *
   * Ids alone: whoever asked has the spaces, with their names and their storeys,
   * and an answer carrying copies of those would go stale against a rename.
   *
   * Grouped rather than one flat list of everything outside the largest, because a
   * model split into two equal wings has no largest: both halves are the finding,
   * and flattening would pick one arbitrarily and call the other the building.
   *
   * A disconnected set of spaces is an island. Not "components", which is the
   * algorithm rather than the finding, and not "groups", which in this estate
   * already means the thing authorization runs against.
   */
  islands: string[][];
  /** How many sit outside the largest island: the number somebody acts on. */
  spaces: number;
}

/**
 * A union rather than an optional field, so the invariant is checkable instead of
 * documented: narrowing on `connected` is what gives a caller the explanation, and
 * there is nothing to read when the model is whole.
 */
export type ConnectivityResponse =
  | {
      connected: true;
      /**
       * How many spaces were examined. Zero are trivially connected, so without
       * this a model with nothing in it reads as whole.
       */
      spaces: number;
    }
  | {
      connected: false;
      disconnected: DisconnectedSpaces;
      spaces: number;
    };

/**
 * The response as a schema, so the route can publish it.
 *
 * Mirrors the union above rather than replacing it: the interface is what a caller
 * narrows on, and this is what the portal renders and what a DTO is built from.
 */
export const connectivityResponseSchema = z.discriminatedUnion("connected", [
  z.object({
    connected: z.literal(true),
    spaces: z.number().int().nonnegative(),
  }),
  z.object({
    connected: z.literal(false),
    disconnected: z.object({
      islands: z.array(z.array(z.string().uuid())),
      spaces: z.number().int().nonnegative(),
    }),
    spaces: z.number().int().nonnegative(),
  }),
]);

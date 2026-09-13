import { z } from "zod";

/**
 * `POST /projects/:projectId/analysis/adjacency`
 *
 * Which spaces share a boundary.
 *
 * A different relation from passability and a different question: `adjacentTo` is
 * a shared wall, `connectsTo` is a way through. Treating one as the other is how a
 * party wall becomes a doorway, which is why neither analysis lets a caller
 * substitute the edge.
 *
 * What it is for is separation rather than movement: fire compartment boundaries,
 * acoustic separation between an office and a plant room, clean-against-dirty in a
 * hospital. Those rules are all of the form "these two uses may not share a
 * boundary unless the element between them does X".
 */
export const adjacencyInputSchema = z.object({
  /**
   * Return only pairs whose `programme.use` differs. The separation rules are all
   * about unlike neighbours, and a floor of identical offices is noise.
   */
  differingUseOnly: z.boolean().default(false),
  parentId: z.string().uuid().optional(),
});

export type AdjacencyInput = z.infer<typeof adjacencyInputSchema>;

export interface AdjacentPair {
  /** Lower id first, so a pair appears once rather than in both directions. */
  aId: string;
  aUse: string | null;
  bId: string;
  bUse: string | null;
}

export interface AdjacencyResponse {
  /** Spaces the analysis looked at, so no pairs over no spaces reads correctly. */
  examined: number;
  pairs: AdjacentPair[];
}

/**
 * The response as a schema, so the route can publish it.
 *
 * Mirrors the interface above rather than replacing it: the interface is what a
 * caller narrows on, and this is what the portal renders and what a DTO is built
 * from.
 */
export const adjacencyResponseSchema = z.object({
  examined: z.number().int().nonnegative(),
  pairs: z.array(
    z.object({
      aId: z.string().uuid(),
      aUse: z.string().nullable(),
      bId: z.string().uuid(),
      bUse: z.string().nullable(),
    })
  ),
});

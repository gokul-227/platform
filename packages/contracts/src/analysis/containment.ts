import { z } from "zod";

/**
 * `POST /projects/:projectId/analysis/containment`
 *
 * Whether the spatial tree holds: every space in a storey, every storey in a
 * building, nothing in two places at once.
 *
 * A defect check rather than a finding about the building. A space that belongs
 * to no storey is not an architectural problem, it is an import that lost the
 * relation, and every rollup downstream — area per storey, occupancy per floor,
 * compartment sizing — is silently wrong until it is fixed.
 *
 * Containment is expressed two ways and both are legitimate: `parentId` on the
 * node, and an explicit `contains` edge. An importer may use either, so an orphan
 * is a node with neither, not a node missing one.
 */
export const containmentInputSchema = z.object({
  /**
   * Which classes must have a container. Defaults to the spatial tree; an element
   * hosted in a wall is a different relation and not missing anything.
   */
  classes: z.array(z.string().min(1)).default(["space", "storey"]),
});

export type ContainmentInput = z.infer<typeof containmentInputSchema>;

export interface ContainedTwice {
  nodeId: string;
  parentIds: string[];
}

export interface ContainmentResponse {
  /** Nodes contained by more than one parent: a tree that is not a tree. */
  containedTwice: ContainedTwice[];
  examined: number;
  /** Nodes of the named classes with no container at all, by either expression. */
  orphans: string[];
  /** True when nothing is orphaned and nothing is contained twice. */
  sound: boolean;
}

/**
 * The response as a schema, so the route can publish it.
 *
 * Mirrors the interface above rather than replacing it.
 */
export const containmentResponseSchema = z.object({
  containedTwice: z.array(
    z.object({
      nodeId: z.string().uuid(),
      parentIds: z.array(z.string().uuid()),
    })
  ),
  examined: z.number().int().nonnegative(),
  orphans: z.array(z.string().uuid()),
  sound: z.boolean(),
});

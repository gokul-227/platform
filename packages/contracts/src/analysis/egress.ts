import { z } from "zod";

/**
 * `POST /projects/:projectId/analysis/egress`
 *
 * How far every space is from a way out, and which spaces are too far or have no
 * way out at all.
 *
 * The check the statute concentrates on: § 35 MBO puts a limit on travel distance
 * to a stair or the open air, and the number it compares against is this one.
 *
 * Directed, from the space toward the exit, for the reason a route is: an escape
 * route that runs backwards through a one-way door is not an escape route. And the
 * exits have to be named rather than guessed — a building where nothing is marked
 * as an exit is not a building where everything fails, it is a building nobody has
 * told us about, which is why that answers `exits: 0` and refuses to score.
 */
export const egressInputSchema = z.object({
  /**
   * Which spaces count as a way out. Defaults to what the programme block marks;
   * `exitIds` pins them explicitly when the model does not carry the mark yet.
   */
  exitIds: z.array(z.string().uuid()).optional(),
  /** The limit to compare against, in metres. § 35 MBO is 35 m. */
  maxDistance: z.number().positive().optional(),
  parentId: z.string().uuid().optional(),
});

export type EgressInput = z.infer<typeof egressInputSchema>;

export interface EgressSpace {
  /** The exit this distance was measured to: the nearest one. */
  exitId: string;
  nodeId: string;
  value: number;
}

export interface EgressResponse {
  /** Spaces the analysis looked at, exits excluded. */
  examined: number;
  /** How many spaces were treated as a way out. Zero means nothing was scored. */
  exits: number;
  /** The furthest few, worst first: where the limit is closest to being broken. */
  furthest: EgressSpace[];
  /** How the distances were arrived at; `hops` cannot settle a metric rule. */
  measuredIn: "metres" | "hops";
  /** Over the limit, when one was given. Empty when no limit was asked for. */
  overLimit: EgressSpace[];
  /** Spaces with no way out at all: the finding that outranks any distance. */
  unreachable: string[];
}

const egressSpaceSchema = z.object({
  exitId: z.string().uuid(),
  nodeId: z.string().uuid(),
  value: z.number().nonnegative(),
});

/**
 * The response as a schema, so the route can publish it.
 *
 * Mirrors the interface above rather than replacing it.
 */
export const egressResponseSchema = z.object({
  examined: z.number().int().nonnegative(),
  exits: z.number().int().nonnegative(),
  furthest: z.array(egressSpaceSchema),
  measuredIn: z.enum(["metres", "hops"]),
  overLimit: z.array(egressSpaceSchema),
  unreachable: z.array(z.string().uuid()),
});

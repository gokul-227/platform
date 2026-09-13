import { z } from "zod";

/**
 * `POST /projects/:projectId/analysis/routing`
 *
 * The shortest way from one space to another, and how far it is.
 *
 * Walked in the direction of travel, unlike connectivity. `connectsTo` is
 * directed so a security door, a turnstile or a stair discharge that locks behind
 * you is a single arc; a route that ignored that would send somebody back through
 * a door they cannot open.
 *
 * Weighted by the passage's own `length` when it carries one, and by hop count
 * when it does not — and the response says which, because "four doors away" and
 * "31 metres away" are not interchangeable and only one of them settles a rule.
 */
export const routingInputSchema = z.object({
  fromId: z.string().uuid(),
  toId: z.string().uuid(),
});

export type RoutingInput = z.infer<typeof routingInputSchema>;

export type RoutingResponse =
  | { reachable: false }
  | {
      /** How the distance was arrived at. `hops` means no passage carried a length. */
      measuredIn: "metres" | "hops";
      /** The spaces passed through, in order, ends included. */
      nodeIds: string[];
      reachable: true;
      value: number;
    };

/**
 * The response as a schema, so the route can publish it.
 *
 * A discriminated union for the same reason the type is one: there is nothing to
 * read on an unreachable pair, and `reachable` is what a caller narrows on.
 */
export const routingResponseSchema = z.discriminatedUnion("reachable", [
  z.object({ reachable: z.literal(false) }),
  z.object({
    measuredIn: z.enum(["metres", "hops"]),
    nodeIds: z.array(z.string().uuid()),
    reachable: z.literal(true),
    value: z.number().nonnegative(),
  }),
]);

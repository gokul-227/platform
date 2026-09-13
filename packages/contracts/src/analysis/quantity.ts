import { z } from "zod";
import { querySpecSchema } from "../graph/query.spec";

/**
 * `POST /projects/:projectId/analysis/quantity`
 *
 * Count, or total, any field over a class.
 *
 * The workhorse: a rule whose measure is a path resolves through this, so one
 * analysis answers the whole dimensional family. Named quantities — "net floor
 * area", "circulation share" — are presets over this body, not analyses of their
 * own: what counts as net floor area is a decision per jurisdiction, and a
 * decision belongs in data rather than in a deploy.
 *
 * Answered from Postgres, so it reads the row that was committed rather than a
 * projection that trails it.
 */
export const quantityInputSchema = querySpecSchema;

export type QuantityInput = z.infer<typeof quantityInputSchema>;

export interface QuantityGroup {
  /** The group's label. A node field, or the related node's name or id. */
  group: string;
  value: number;
}

/**
 * Null is not zero. A count of nothing is zero; an average of nothing is
 * unknown, and the caller decides which it wanted.
 */
export type QuantityResponse =
  | { grouped: false; value: number | null }
  | { grouped: true; groups: QuantityGroup[] };

/**
 * The response as a schema, so the route can publish it.
 *
 * A discriminated union for the same reason the type is one: a grouped answer and
 * a scalar answer are not the same shape, and `grouped` is what a caller narrows
 * on.
 */
export const quantityResponseSchema = z.discriminatedUnion("grouped", [
  z.object({
    grouped: z.literal(false),
    value: z.number().nullable(),
  }),
  z.object({
    grouped: z.literal(true),
    groups: z.array(
      z.object({
        group: z.string(),
        value: z.number(),
      })
    ),
  }),
]);

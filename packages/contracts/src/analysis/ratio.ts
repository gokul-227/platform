import { z } from "zod";
import { querySpecSchema } from "../graph/query.spec";

/**
 * `POST /projects/:projectId/analysis/ratio`
 *
 * One quantity over another: net to gross, circulation share, occupancy density,
 * glazed area against floor area.
 *
 * Its own route rather than a preset, because the body carries two specs and one
 * answer, which no quantity call can express. Everything above the two specs is
 * a preset over this.
 */
export const ratioInputSchema = z.object({
  denominator: querySpecSchema,
  /** Return the value multiplied by 100. */
  isPercent: z.boolean().default(false),
  numerator: querySpecSchema,
});

export type RatioInput = z.infer<typeof ratioInputSchema>;

export interface RatioResponse {
  denominator: number | null;
  numerator: number | null;
  /**
   * Null when either operand is null, or the denominator is zero. Both operands
   * come back so a null answer can be explained rather than guessed at.
   */
  value: number | null;
}

/**
 * The response as a schema, so the route can publish it.
 *
 * Mirrors the interface above rather than replacing it.
 */
export const ratioResponseSchema = z.object({
  denominator: z.number().nullable(),
  numerator: z.number().nullable(),
  value: z.number().nullable(),
});

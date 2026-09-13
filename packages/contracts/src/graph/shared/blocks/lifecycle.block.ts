import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Lifecycle block: review and legal standing, not project phase.
 *
 * `excluded` is the only status that stops a rule binding. Everything else
 * binds, and whether a person has confirmed it travels on `provenance`, so an
 * unreviewed rule still produces verdicts and they are reported apart from the
 * reviewed ones. A `draft` status that withheld binding would mean a first run
 * produced nothing visible.
 */
export const LIFECYCLE_STATUSES = [
  "active",
  "excluded",
  "inReview",
  "superseded",
  "inForce",
  "repealed",
] as const;

export const lifecycleSchema = z
  .object({
    status: z
      .string()
      .min(1)
      .optional()
      .describe(
        `Canonical: ${LIFECYCLE_STATUSES.join(", ")}. Absent counts as \`active\`; only \`excluded\` withholds binding.`
      ),
    /** ISO date the standing began. */
    since: z.string().min(4).optional(),
    until: z.string().min(4).optional(),
    /** The node that replaced this one, for an amendment. */
    supersededBy: z.string().optional(),
  })
  .passthrough();

export type Lifecycle = z.infer<typeof lifecycleSchema>;

export const lifecycleBlock = defineBlock({
  key: "lifecycle",
  description:
    "Review and legal standing: status, the dates it holds between, what superseded it.",
  schema: lifecycleSchema,
});

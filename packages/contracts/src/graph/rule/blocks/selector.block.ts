import { z } from "zod";
import { defineBlock } from "../../registry/block";
import { predicateSchema } from "../../shared/predicate";

/**
 * Selector block: who the rule applies to. The single, versioned answer to that
 * question, which is why an asserted edge does not also answer it: an edge
 * outside the rule would change scope without bumping the version a verdict is
 * stamped with, so two verdicts at one `ruleVersion` could come from two
 * different bindings.
 *
 * `where` is a pure conjunction. `unless` is a list of groups where any full
 * match means not-applicable, which is the shape statutory exemptions take. A
 * disjunction inside `where` is not expressible on purpose; add a case instead.
 */
export const selectorSchema = z
  .object({
    /** Class match, prefix-inclusive: `space` selects `space.kitchen`. */
    classes: z.array(z.string().min(1)).optional(),
    where: z.array(predicateSchema).optional(),
    /** Explicit pins, for the target a class and a predicate cannot describe. */
    nodeIds: z.array(z.string()).optional(),
    /** Actions this rule is evaluated against; absent means all of them. */
    intents: z.array(z.string().min(1)).optional(),
    unless: z.array(z.array(predicateSchema)).optional(),
    jurisdictions: z.array(z.string().min(1)).optional(),
  })
  .passthrough();

export type Selector = z.infer<typeof selectorSchema>;

export const selectorBlock = defineBlock({
  key: "selector",
  description:
    "Who the rule binds to: classes, property predicates, explicit pins, intents, and the exemption groups that exclude it.",
  schema: selectorSchema,
});

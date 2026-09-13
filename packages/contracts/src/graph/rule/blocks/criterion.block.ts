import { z } from "zod";
import { defineBlock } from "../../registry/block";
import {
  contextPathSchema,
  predicateOperatorSchema,
  predicateSchema,
} from "../../shared/predicate";

/**
 * Criterion block: what the rule demands.
 *
 * Optional fields are `nullish`, not `optional`. A producer that means "this
 * measure has no unit" sends `null`, and rejecting that while accepting an
 * absent key is a distinction without a difference that costs real writes.
 *
 * `measure` is a discriminated union on `type`; the variant decides which
 * evaluator runs and which dependency key the verdict records. `method` names
 * how the quantity is measured, because a criterion that reads a plausible
 * neighbouring quantity (clear glazed area where the statute means Rohbaumass)
 * returns `pass` with full provenance and is wrong.
 */
const measurandFields = {
  /** The named quantity, so two rules reading one thing agree they do. */
  measurand: z.string().nullish(),
  /** How it is measured, where the path alone is ambiguous. */
  method: z.string().nullish(),
  unit: z.string().nullish(),
};

export const measureSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("path"),
        path: contextPathSchema,
        ...measurandFields,
      })
      .passthrough(),
    z
      .object({
        type: z.literal("expression"),
        expression: z.string().min(1),
        ...measurandFields,
      })
      .passthrough(),
    z
      .object({
        type: z.literal("relation"),
        edgeType: z.string().min(1),
        targetClass: z.string().nullish(),
        aggregate: z.string().min(1).nullish(),
        ...measurandFields,
      })
      .passthrough(),
    z
      .object({
        type: z.literal("analysis"),
        analysis: z.string().min(1),
        field: z.string().min(1).nullish(),
        options: z.record(z.unknown()).nullish(),
        ...measurandFields,
      })
      .passthrough(),
    z
      .object({
        type: z.literal("aggregate"),
        over: z.string().min(1),
        path: contextPathSchema,
        aggregate: z.string().min(1).nullish(),
        ...measurandFields,
      })
      .passthrough(),
    z
      .object({
        type: z.literal("judgement"),
        prompt: z.string().min(1),
        evidence: z.array(z.string()).nullish(),
        expiresOn: z.string().nullish(),
        ...measurandFields,
      })
      .passthrough(),
  ])
  .describe(
    "How the measured value is obtained. `judgement` keeps a rule nobody can compute in the graph, in the coverage count, and in somebody's queue, rather than dropping it."
  );

export type Measure = z.infer<typeof measureSchema>;

/**
 * A bound. `value` is a literal; `ref` makes the bound itself a measure, as
 * `ref x factor + offset`. Exactly one of the two, and `ref` must resolve to
 * the measure's unit after both.
 */
export const constraintSchema = z
  .object({
    operator: predicateOperatorSchema,
    value: z.unknown().optional(),
    ref: z.object({ path: contextPathSchema }).passthrough().optional(),
    factor: z.number().optional(),
    offset: z.number().optional(),
    /** Inactive when this does not hold, so independent dimensions do not multiply the case list. */
    when: z.array(predicateSchema).optional(),
  })
  .passthrough();

export type Constraint = z.infer<typeof constraintSchema>;

/**
 * A case supplies the constraints when its `when` holds. `nummer` is the
 * statutory citation and `order` is evaluation order; they routinely disagree,
 * and taking the statute's own numbering as evaluation order is how a residual
 * clause overrides the specific one it was written beneath.
 */
export const criterionCaseSchema = z
  .object({
    nummer: z.string().nullish(),
    order: z.number().int(),
    when: z.array(predicateSchema),
    constraints: z.array(constraintSchema).min(1),
    quote: z.string().nullish(),
  })
  .passthrough();

export type CriterionCase = z.infer<typeof criterionCaseSchema>;

/**
 * A classifying rule: it writes a value rather than deciding a verdict.
 *
 * § 38 (2) LBO BW does not require anything of a building; it declares which
 * buildings are Sonderbauten, and § 2 declares which Gebäudeklasse a building
 * falls in. Expressed as a criterion, "a school is a Sonderbau" reads as "every
 * space must be a school" and fails every room in the building. Measured on a
 * real export that is exactly what happened: one such rule produced 168 false
 * failures over 269 spaces.
 *
 * So a rule with `assigns` produces no verdict at all. It runs before the
 * compliance pass and writes `path = value` on each matching node, which is
 * what lets the rules downstream read a classification the source file never
 * stated. `fire.buildingClass` is the case that matters: twenty-seven extracted
 * rules read it and no IFC file carries it.
 */
export const assignmentSchema = z
  .object({
    path: contextPathSchema,
    value: z.unknown(),
    /** Where it is written, when not the matched node. Defaults to the node. */
    onto: z.string().nullish(),
  })
  .passthrough();

export type Assignment = z.infer<typeof assignmentSchema>;

export const criterionSchema = z
  .object({
    measure: measureSchema.optional(),
    constraints: z.array(constraintSchema).optional(),
    cases: z.array(criterionCaseSchema).min(1).optional(),
    /** Present means this rule classifies and never produces a verdict. */
    assigns: assignmentSchema.optional(),
    /** What an unmatched case set yields. Never `pass`: a gap is not compliance. */
    onNoCase: z.enum(["skip", "error"]).optional(),
  })
  .passthrough()
  .superRefine((criterion, ctx) => {
    const hasConstraints = criterion.constraints !== undefined;
    const hasCases = criterion.cases !== undefined;
    // A classifying rule writes a value instead of deciding one, so it needs
    // neither a bound nor a measure, and carrying both would make it ambiguous
    // whether the rule classifies or checks.
    if (criterion.assigns) {
      if (hasConstraints || hasCases) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assigns"],
          message:
            "a rule that assigns cannot also constrain: it classifies, it does not check",
        });
      }
      return;
    }
    if (!criterion.measure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["measure"],
        message: "a criterion needs a measure unless it assigns",
      });
      return;
    }
    // A judgement carries no bound: the reviewer's answer is the verdict, so
    // demanding one would make every rule nobody can compute unrepresentable,
    // which is the opposite of why the variant exists.
    if (criterion.measure?.type === "judgement") {
      return;
    }
    if (hasConstraints === hasCases) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exactly one of `constraints` or `cases`",
      });
    }
    const open = (criterion.cases ?? []).filter(
      (entry) => entry.when.length === 0
    );
    if (open.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cases"],
        message: "at most one open case (`when: []`)",
      });
    }
    const highest = Math.max(
      ...(criterion.cases ?? []).map((entry) => entry.order),
      Number.NEGATIVE_INFINITY
    );
    if (open.length === 1 && open[0] && open[0].order !== highest) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cases"],
        message: "the open case must carry the highest `order`",
      });
    }
  });

export type Criterion = z.infer<typeof criterionSchema>;

export const criterionBlock = defineBlock({
  key: "criterion",
  description:
    "What the rule demands: the measure, and either flat constraints or an ordered case list that supplies them. A criterion carrying `assigns` classifies instead, and produces no verdict.",
  schema: criterionSchema,
});

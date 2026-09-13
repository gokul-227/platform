import { z } from "zod";
import { predicateSchema } from "./shared/predicate";

/**
 * What to select, filter, aggregate and group, as data rather than as query
 * text. A dialect compiles it; an analysis builds it and stays portable across
 * stores.
 *
 * Filters are the platform's one predicate shape, `{ path, operator, value }`,
 * imported rather than restated: a list filter, a rule's selector and an
 * analysis filter are the same question asked in three places, and a second
 * comparison vocabulary is how they drift apart. A dialect that cannot compile a
 * context prefix on a path refuses the spec.
 *
 * Scope is never in here. It is applied by the store, so no analysis can leak
 * across projects by forgetting a predicate.
 */

/**
 * A dot-path of identifiers. A property path cannot be a bound parameter in
 * either dialect, so it is built into the query text; restricting it to
 * identifier segments is what makes that safe. Not an allow-list: passthrough
 * and source-specific fields have to stay reachable.
 */
export const fieldPathSchema = z
  .string()
  .regex(
    /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/,
    "a dot-path of identifiers, e.g. 'envelope.areaNet'"
  );

/**
 * An edge type, for grouping by a related node. Also unparameterisable, so also
 * identifier-gated.
 */
export const edgeTypeSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9]*$/, "an edge type identifier, e.g. 'hostedIn'");

/**
 * `prefix` includes the subtypes of a class root, `exact` does not. Prefix is
 * the default because a class refines within its root, so a rule about `space`
 * means every kind of space.
 */
export const classMatchSchema = z.enum(["prefix", "exact"]);

/** Which nodes: an optional class filter and ANDed predicates. */
export const selectionSchema = z.object({
  class: z
    .object({
      match: classMatchSchema.default("prefix"),
      value: z.string().min(1),
    })
    .optional(),
  where: z.array(predicateSchema).optional(),
});

export const aggregateMethodSchema = z.enum([
  "count",
  "sum",
  "avg",
  "min",
  "max",
]);

export const aggregateSchema = z
  .object({
    field: fieldPathSchema.optional(),
    method: aggregateMethodSchema,
  })
  .refine((entry) => entry.method === "count" || entry.field !== undefined, {
    message: "field is required unless the method is 'count'",
    path: ["field"],
  });

/**
 * Group by a field on the node, or by a node reached over one edge. A grouped
 * query returns `{ group, value }` rows instead of one value.
 *
 * The relation form is the only part of this spec that needs the edge table in
 * SQL. It is one join, not traversal, so it stays on the relational side, and it
 * is what "per storey" depends on.
 */
export const groupBySchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("field"), field: fieldPathSchema }),
  z.object({
    by: z.literal("relation"),
    /** `in`: the group node points at the selected node. `out`: the reverse. */
    direction: z.enum(["in", "out"]).default("in"),
    edge: edgeTypeSchema,
    groupClass: z.string().optional(),
    label: z.enum(["name", "id"]).default("name"),
  }),
]);

export const querySpecSchema = z.object({
  aggregate: aggregateSchema,
  groupBy: groupBySchema.optional(),
  select: selectionSchema,
});

export type Aggregate = z.infer<typeof aggregateSchema>;
export type ClassMatch = z.infer<typeof classMatchSchema>;
export type GroupBy = z.infer<typeof groupBySchema>;
export type QuerySpec = z.infer<typeof querySpecSchema>;
export type Selection = z.infer<typeof selectionSchema>;

import { z } from "zod";

/**
 * The one comparison vocabulary. The same operator names serve list filters,
 * selector predicates and rule constraints; a list endpoint's per-field `ops`
 * array is a subset of these names, never a second spelling of them.
 *
 * Open by construction: an unrecognised operator is accepted, counted as drift,
 * and evaluates to `error`. It must never evaluate to `pass`.
 */
export const PREDICATE_OPERATORS = [
  "gte",
  "gt",
  "lte",
  "lt",
  "eq",
  "neq",
  "in",
  "notIn",
  "contains",
  "startsWith",
  "endsWith",
  "match",
  "exists",
  "notExists",
] as const;

export type PredicateOperator = (typeof PREDICATE_OPERATORS)[number];

export const predicateOperatorSchema = z
  .string()
  .min(1)
  .describe(
    `Comparison operator. Canonical: ${PREDICATE_OPERATORS.join(", ")}. An unknown operator is accepted, counted as drift, and evaluates to \`error\`.`
  );

/**
 * A path into the evaluation context. Resolution is lexical and closed: six
 * prefixes, no expressions, at most one edge hop.
 *
 *   envelope.areaNet                       the subject node
 *   parent.envelope.areaNet                the hierarchical parent
 *   storey.compliance.status               nearest ancestor of that class
 *   project.landUseCategory                the project anchor
 *   intent.storeysAdded                    the evaluation context
 *   @bounds[element.wall].envelope.height  across one edge, needs an aggregate
 */
export const CONTEXT_PATH_PREFIXES = ["parent", "project", "intent"] as const;

/**
 * An ancestor hop is spelled with the ancestor's own class root, so the set is
 * open the way the class vocabulary is: `storey.compliance.status`,
 * `building.class`, `site.zoning.type` all mean "nearest ancestor of that
 * class". Enumerating a fixed four made `building.` and `site.` unresolvable,
 * which is the single largest source of unresolvable paths in a formalisation
 * pass over a statute: German building law keys most of its fire requirements
 * off the Gebäudeklasse, which lives on the building ancestor.
 */
export const ANCESTOR_PATH_PREFIXES = [
  "site",
  "building",
  "storey",
  "space",
] as const;

export const contextPathSchema = z
  .string()
  .min(1)
  .max(200)
  .describe(
    `Dot-path into the evaluation context. A bare path reads the subject node's own blocks (\`envelope.areaNet\`). \`parent.\` is the hierarchical parent, \`project.\` the project anchor, \`intent.\` the evaluation context, and any class root (\`${ANCESTOR_PATH_PREFIXES.join("`, `")}\`) is the nearest ancestor of that class. \`@edgeType[class].path\` crosses one edge and needs an aggregate.`
  );

/** `{ path, operator, value }`, identically in `where`, `when` and filters. */
export const predicateSchema = z
  .object({
    path: contextPathSchema,
    operator: predicateOperatorSchema,
    value: z.unknown().optional(),
  })
  .passthrough();

export type Predicate = z.infer<typeof predicateSchema>;

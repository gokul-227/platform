import { z } from "zod";
/**
 * Where a row lives and who it answers to.
 *
 * Three columns, two jobs. `orgId` is the tenant partition and `projectId` is
 * the delivery boundary: both are filters, and no authorization check reads
 * either. `groupId` is the set of people the row answers to, and it is the only
 * thing a check ever looks at.
 *
 * They were one concept while every partition owned exactly one group, because
 * the group was then derivable from the other two. A group anybody can create
 * ends that: a restricted folder sits in the project and belongs to somebody
 * else, so the owner has to be its own column and its own question.
 *
 * Lives in contracts, with no dependency of its own, so both the SQL predicates
 * and the authorization layer can read it without importing the other.
 */

/**
 * A group, resolved, with the partition it sits in.
 *
 * There is no discriminant: `projectId === null` is the org case, and deriving
 * it is what keeps the two from drifting apart. A row is org-scoped exactly
 * when it has no project.
 */
export interface ResolvedScope {
  groupId: string;
  orgId: string;
  projectId: string | null;
}

/** The three columns every scoped table shares. */
export interface ScopedRow {
  groupId: string;
  orgId: string;
  projectId: string | null;
}

/** The context a row belongs to, read off its own columns. */
export function scopeFromRow(row: ScopedRow): ResolvedScope {
  return {
    groupId: row.groupId,
    orgId: row.orgId,
    projectId: row.projectId,
  };
}

/** True when this context is the org's own rather than a project's. */
export function isOrgScope(context: { projectId: string | null }): boolean {
  return context.projectId === null;
}

/**
 * Whether a row falls strictly within a context's partition. Deliberately not
 * an authorization check: it answers "is this row in the partition I asked
 * for", and whether the caller may touch it is answered against `row.groupId`.
 */
export function rowInScope(row: ScopedRow, context: ResolvedScope): boolean {
  if (context.projectId == null) {
    return row.orgId === context.orgId && row.projectId == null;
  }
  return row.projectId === context.projectId;
}

/**
 * How a caller addresses a scoped collection: one org, or one project.
 *
 * One definition for every resource that has both. Files, graph, threads and
 * audit all ask the same question, and three copies of the union drifted apart
 * once already.
 */
export const scopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("org"), orgId: z.string().uuid() }),
  z.object({ type: z.literal("project"), projectId: z.string().uuid() }),
]);
export type Scope = z.infer<typeof scopeSchema>;

/**
 * The same scope as a query pair, for a collection that takes it as a parameter
 * rather than in the path. Exactly one: naming both would leave the server to
 * pick, and picking silently is how a caller reads the wrong partition.
 */
export const scopeQueryShape = {
  orgId: z
    .string()
    .uuid()
    .optional()
    .describe("The organization to read. Exclusive with `projectId`."),
  projectId: z
    .string()
    .uuid()
    .optional()
    .describe("The project to read. Exclusive with `orgId`."),
};

/**
 * Composable with any list input: `listInputSchema(spec).extend(scopeQueryShape)`.
 *
 * Naming neither and naming both are different mistakes with different fixes,
 * so they are told apart. The query string is named because a POST carries its
 * scope there rather than in the body.
 */
export function scopeQueryRefinement(
  query: { orgId?: string | undefined; projectId?: string | undefined },
  ctx: z.RefinementCtx
): void {
  const named = Boolean(query.orgId) !== Boolean(query.projectId);
  if (named) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: query.orgId
      ? "Name only one of `orgId` or `projectId`: naming both leaves the server to pick a partition."
      : "Name `orgId` or `projectId` in the query string.",
    path: ["orgId"],
  });
}

export const scopeQuerySchema = z
  .object(scopeQueryShape)
  .superRefine(scopeQueryRefinement);
export type ScopeQuery = z.infer<typeof scopeQuerySchema>;

/** The query pair as the scope the services take. */
export function scopeOfQuery(query: ScopeQuery): Scope {
  return query.projectId
    ? { type: "project", projectId: query.projectId }
    : { type: "org", orgId: query.orgId as string };
}

/** For a surface that only exists on a project: the id is required, not a pair. */
export const projectScopeQuerySchema = z.object({
  projectId: z.string().uuid().describe("The project to read."),
});
export type ProjectScopeQuery = z.infer<typeof projectScopeQuerySchema>;

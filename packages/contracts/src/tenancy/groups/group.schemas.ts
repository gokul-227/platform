/**
 * What is left of the group tree on the wire: the partition a row answers to,
 * and what the caller holds across one tenant.
 *
 * A group is an internal noun. An organization and a project each have one, and
 * a caller addresses them as an organization and a project; the two places a
 * group id still appears are `groupId` on a create body, which is how a row is
 * handed to somebody other than the scope's own people, and `/me/groups`, which
 * answers with the caller's own reach.
 */

import { z } from "zod";
import { standingSchema } from "./standing";

/**
 * How a group came to exist, which is the only thing that distinguishes one
 * from another. A group made for an org and a group made for a project are the
 * same row with the same relations.
 */
export const groupTypeSchema = z
  .enum(["org", "project", "custom"])
  .describe(
    "How the group came to exist. `org` and `project` are created with their partition row; `custom` is one made on its own."
  );
export type GroupType = z.infer<typeof groupTypeSchema>;

/**
 * `GET /me/groups`. The organization is optional, and omitting it is the first
 * call a client makes: it holds a token and no ids, so demanding one would
 * refuse the question the route exists to answer. Validated rather than read as
 * a bare `@Query("orgId")`, which reached the database as an unvalidated string.
 */
export const callerStandingListQuerySchema = z.object({
  orgId: z
    .string()
    .uuid()
    .optional()
    .describe("Narrow to one organization. Omit for every one you reach."),
});
export type CallerStandingListQuery = z.infer<
  typeof callerStandingListQuerySchema
>;

/**
 * Who owns the row, when that is not simply whoever owns the scope.
 *
 * The scope says *where* a row lives (which tenant, which project); the group
 * says *whose work it is*, and the two are independent. A contractor's model
 * sits in the project and belongs to the contractor: `project_id` is the
 * project, `group_id` is theirs. Omit it and the row belongs to the scope's own
 * group, which is what a first-party write wants.
 *
 * Writing into a group needs `write` on that group, so naming one you do not
 * hold is refused rather than silently ignored.
 */
export const ownerGroupSchema = z
  .string()
  .uuid()
  .optional()
  .describe(
    "The group that owns this row. Defaults to the group behind the scope. Requires `write` on the group named."
  );

export const callerStandingSchema = z.object({
  groupId: z.string().uuid(),
  groupName: z.string(),
  groupType: groupTypeSchema,
  /**
   * Which partition the group belongs to. A tenant has one row per readable
   * group, so a caller with two projects gets two `project` rows and needs
   * these to tell which is which; without them the only way to pick was the
   * first row of the right type, which served one project's members and permits
   * under every project in the org.
   */
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  standing: standingSchema
    .nullable()
    .describe("The subject's own membership row, when they have one."),
  permits: z.object({
    read: z.boolean(),
    write: z.boolean(),
    manage: z.boolean(),
    admin: z.boolean(),
  }),
});
export type CallerStanding = z.infer<typeof callerStandingSchema>;

export const callerStandingListResponseSchema = z.object({
  items: z.array(callerStandingSchema),
});
export type CallerStandingListResponse = z.infer<
  typeof callerStandingListResponseSchema
>;

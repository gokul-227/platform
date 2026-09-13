/**
 * Who is in an organization or a project, and the standing they hold there.
 *
 * A subject is the identity the token asserts (`principal.subject`) and never
 * the platform `user.id`: that is a Kratos identity id for a person and a client
 * id for a service, both of which the check path already holds, so a check costs
 * no database lookup to resolve who is asking. It is also why a subject is text
 * rather than a uuid, and why a service account can be a member like anyone
 * else.
 */

import { z } from "zod";
import { offsetPageMetaSchema } from "../../query";
import { standingSchema } from "../groups/standing";

export const subjectSchema = z
  .string()
  .min(1)
  .describe(
    "The identity the access token asserts: a Kratos identity id for a person, a client id for a service."
  );

/**
 * Where a member's standing actually sits.
 *
 * Listing only the people added here describes the row and not who reaches it:
 * every permit traverses the parent, so an organization's owner administers a
 * project while having been added to nothing in it. Listing them as `direct`
 * would be worse than omitting them, because a direct standing is the only kind
 * that can be changed here.
 */
export const memberSourceSchema = z
  .enum(["direct", "inherited"])
  .describe(
    "`direct` is held here and is changed here. `inherited` is held on the organization and reaches down into the project, and is changed there."
  );
export type MemberSource = z.infer<typeof memberSourceSchema>;

export const memberResponseSchema = z.object({
  subject: subjectSchema,
  standing: standingSchema,
  source: memberSourceSchema,
  userId: z
    .string()
    .uuid()
    .nullable()
    .describe(
      "The member as the platform knows them, for comparing against `/me` or opening a profile. " +
        "Null for a subject with no user row: a service account, or somebody who has not signed in yet. " +
        "`subject` is the identity provider's and moves when the provider does, so it is not the id to hold on to."
    ),
  email: z.string().nullable(),
  name: z.string().nullable(),
  picture: z.string().nullable(),
});
export type MemberResponse = z.infer<typeof memberResponseSchema>;

/**
 * Offset only: the list is resolved by walking the tuple store rather than read
 * from a table, so there is no keyset to page over. The window bounds the
 * response and the profile join, not the walk.
 */
export const memberListQuerySchema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

export const memberListResponseSchema = z.object({
  items: z.array(memberResponseSchema),
  ...offsetPageMetaSchema.shape,
});
export type MemberListResponse = z.infer<typeof memberListResponseSchema>;

/**
 * Adding someone, by the identifier the caller actually has.
 *
 * A person is named by email: nobody administering a tenant knows a Kratos
 * identity id, and asking for one made the only field on the form unfillable.
 * The server resolves it against the directory and refuses an address it does
 * not know, because a standing stored against a guess is a standing nobody
 * holds.
 *
 * `subject` stays for the case email cannot express: a service account has a
 * client id and no address. Exactly one, so neither is quietly ignored.
 */
export const createMemberInputSchema = z
  .object({
    email: z
      .string()
      .email()
      .optional()
      .describe(
        "The person's email, as the directory knows it. Mutually exclusive with `subject`."
      ),
    subject: subjectSchema
      .optional()
      .describe(
        "The identity directly, for a service account. Mutually exclusive with `email`."
      ),
    standing: standingSchema,
  })
  .refine((input) => Boolean(input.email) !== Boolean(input.subject), {
    message: "Provide exactly one of `email` or `subject`.",
  });
export type CreateMemberInput = z.infer<typeof createMemberInputSchema>;

export const updateMemberInputSchema = z.object({
  standing: standingSchema,
});
export type UpdateMemberInput = z.infer<typeof updateMemberInputSchema>;

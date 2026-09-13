import { z } from "zod";
import { listInputSchema, listResponseSchema } from "../query";

import { userList } from "./user.filters";

export const updateUserInputSchema = z
  .object({
    picture: z.string().url().optional().describe("URL to an avatar image."),
  })
  .describe(
    "Body for self-editing your profile. Only the fields the platform owns: " +
      "`email` and `name` are identity traits, written here solely by the " +
      "provider's webhook, and editing them is a flow on the account page. " +
      "Metadata is written through the `/me/metadata/:keyPath` KV " +
      "sub-resource, not here."
  );

export const userResponseSchema = z
  .object({
    id: z.string().uuid().describe("Stable user id."),
    email: z.string().email().describe("Primary email."),
    name: z.string().nullable().describe("Display name, or `null` if not set."),
    picture: z
      .string()
      .url()
      .nullable()
      .describe("Avatar URL, or `null` if not set."),
    metadata: z
      .record(z.string(), z.unknown())
      .describe("Free-form key/value bag of client-defined data."),
    createdAt: z
      .string()
      .datetime()
      .describe("When the account was created (ISO 8601)."),
    updatedAt: z
      .string()
      .datetime()
      .describe("When the account was last updated (ISO 8601)."),
  })
  .describe("A user account.");

export const userListInputSchema = listInputSchema(userList).describe(
  "Query for listing users (staff only). Filter by `email`, `name`, " +
    "`createdAt`, `externalId`; sort on offset pages. Default sort is `createdAt:asc`."
);

export const userListResponseSchema = listResponseSchema(
  userList,
  userResponseSchema
).describe(
  "Paged user list. Cursor pages carry `nextCursor`; offset pages carry " +
    "`page`/`pageSize`/`total`/`totalPages`."
);

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type UserListInput = z.infer<typeof userListInputSchema>;
export type UserListResponse = z.infer<typeof userListResponseSchema>;

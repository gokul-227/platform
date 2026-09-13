import { z } from "zod";
import { listInputSchema, listResponseSchema } from "../query";
import { ownerGroupSchema } from "../tenancy/groups/group.schemas";

import { threadMetadataSchema, threadScopeSchema } from "./shared";
import { threadList } from "./thread.filters";

// ── Response ────────────────────────────────────────────────────────────────
export const threadResponseSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z
      .string()
      .uuid()
      .describe("Parent organization id. Always present."),
    projectId: z
      .string()
      .uuid()
      .nullable()
      .describe("Owning project id, or `null` when the thread is org-scoped."),
    clientId: z
      .string()
      .nullable()
      .describe(
        "Originating app — the OAuth client id (`azp`) the thread was created from, first-party or " +
          "third-party alike. Records provenance, not ownership (threads are usable across apps). " +
          "`null` only when the token carries no `azp`."
      ),
    subject: z
      .string()
      .describe(
        "Who owns this thread, as the access token asserts them. A thread is a private working surface, so this bounds which rows you see even where your standing lets you use threads in the group at all."
      ),
    title: z
      .string()
      .nullable()
      .describe("Display title; may be auto-derived by the app."),
    metadata: threadMetadataSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .describe("A chat thread.");
export type ThreadResponse = z.infer<typeof threadResponseSchema>;

// ── Create ──────────────────────────────────────────────────────────────────
// `subject`/`clientId` are intentionally absent: they are stamped server-side
// from the authenticated principal, never accepted from the body.
export const createThreadInputSchema = z
  .object({
    scope: threadScopeSchema.describe(
      "Where the thread lives. `{ type: 'org', orgId }` needs `read` on the org; " +
        "`{ type: 'project', projectId }` requires `write` on the project."
    ),
    groupId: ownerGroupSchema,
    title: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .describe("Optional initial title."),
    metadata: threadMetadataSchema.optional(),
  })
  .describe(
    "Create a thread. Identity (owner, client) is stamped from the token."
  );
export type CreateThreadInput = z.infer<typeof createThreadInputSchema>;

// ── Update ──────────────────────────────────────────────────────────────────
export const updateThreadInputSchema = z
  .object({
    title: z.string().min(1).max(255).optional().describe("New title."),
  })
  .describe(
    "Rename a thread. Title is the only mutable user-facing field. Metadata is written " +
      "through the `/threads/:threadId/metadata/:keyPath` KV sub-resource, not here."
  );
export type UpdateThreadInput = z.infer<typeof updateThreadInputSchema>;

// ── List ────────────────────────────────────────────────────────────────────
export const threadListInputSchema = listInputSchema(threadList)
  .extend({
    orgId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "List org-scoped threads. Mutually exclusive with `projectId`. Requires `read` on the organization."
      ),
    projectId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "List a project's threads. Mutually exclusive with `orgId`. Requires `read` on the project."
      ),
  })
  .refine((q) => Boolean(q.orgId) !== Boolean(q.projectId), {
    message: "Provide exactly one of `orgId` or `projectId`.",
  })
  .describe(
    "List threads in one scope. Provide exactly one of `orgId` or `projectId`. " +
      "PostgREST-style filters on clientId/title/createdAt/updatedAt."
  );
export type ThreadListInput = z.infer<typeof threadListInputSchema>;

export const threadListResponseSchema = listResponseSchema(
  threadList,
  threadResponseSchema
).describe("Paged thread list response.");
export type ThreadListResponse = z.infer<typeof threadListResponseSchema>;

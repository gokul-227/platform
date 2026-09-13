import { z } from "zod";
import { listInputSchema, listResponseSchema } from "../../query";
import {
  threadEntityRefSchema,
  threadMessagePartSchema,
  threadMetadataSchema,
  threadRoleSchema,
} from "../shared";

import { threadMessageList } from "./thread.message.filters";

// ── Response ────────────────────────────────────────────────────────────────
// Messages are insert-once and immutable. There is no `status`, no `usage`
// (that lives on the run), and no update/delete shape.
export const threadMessageResponseSchema = z
  .object({
    id: z.string().uuid(),
    threadId: z.string().uuid(),
    role: threadRoleSchema,
    content: z.string(),
    parts: z
      .array(threadMessagePartSchema)
      .nullable()
      .describe(
        "The message's structured pieces as the writer sent them, or `null` when it sent none."
      ),
    references: z
      .array(threadEntityRefSchema)
      .nullable()
      .describe(
        "Typed pointers to platform entities this message refers to, or `null`."
      ),
    metadata: threadMetadataSchema,
    createdAt: z.string().datetime(),
  })
  .describe("An immutable message in a thread.");
export type ThreadMessageResponse = z.infer<typeof threadMessageResponseSchema>;

// ── Create (append) ────────────────────────────────────────────────────────
// Used directly for user (and other non-generated) messages. Assistant messages
// are inserted by the platform when a run is completed (see thread.run.schemas).
export const createThreadMessageInputSchema = z
  .object({
    role: threadRoleSchema,
    content: z.string().min(1).describe("Message body."),
    parts: z
      .array(threadMessagePartSchema)
      .min(1)
      .max(128)
      .optional()
      .describe(
        "Optional structured pieces of this message (tool calls, reasoning, attachments), stored verbatim."
      ),
    references: z
      .array(threadEntityRefSchema)
      .optional()
      .describe(
        "Optional typed entity pointers (e.g. graph nodes a result highlights)."
      ),
    metadata: threadMetadataSchema.optional(),
  })
  .describe(
    "Append a message to a thread. Append-only; messages are never edited or deleted."
  );
export type CreateThreadMessageInput = z.infer<
  typeof createThreadMessageInputSchema
>;

// ── List ────────────────────────────────────────────────────────────────────
export const threadMessageListInputSchema = listInputSchema(
  threadMessageList
).describe(
  "List a thread's messages, oldest-first. PostgREST-style filters on role/createdAt."
);
export type ThreadMessageListInput = z.infer<
  typeof threadMessageListInputSchema
>;

export const threadMessageListResponseSchema = listResponseSchema(
  threadMessageList,
  threadMessageResponseSchema
).describe("Paged message list response.");
export type ThreadMessageListResponse = z.infer<
  typeof threadMessageListResponseSchema
>;

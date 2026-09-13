import { z } from "zod";
import { listInputSchema, listResponseSchema } from "../../query";
import {
  threadAgentConfigSchema,
  threadEntityRefSchema,
  threadMetadataSchema,
  threadModelTierSchema,
  threadRunActionSchema,
  threadRunStatusSchema,
  threadRunUsageSchema,
} from "../shared";

import { threadRunList } from "./thread.run.filters";

// ── Debug trace (ops / local only) ────────────────────────────────────────────
// The agent's query trace for one run. Present only when the deployment enables
// debug (`config.runDebug`, off in prod) — it carries raw Cypher and is an ops /
// local-dev surface, never part of the user-facing answer.
export const threadRunStepSchema = z.object({
  query: z.string().describe("A Cypher query the agent ran."),
  recordCount: z
    .number()
    .int()
    .nonnegative()
    .describe("Rows the query returned."),
  error: z
    .string()
    .optional()
    .describe("Present when the query failed or was rejected."),
});
export type ThreadRunStep = z.infer<typeof threadRunStepSchema>;

export const threadRunDebugSchema = z
  .object({
    steps: z
      .array(threadRunStepSchema)
      .describe("The agent's query trace, in order."),
  })
  .describe(
    "Per-run debug trace; present only when the deployment enables debug."
  );
export type ThreadRunDebug = z.infer<typeof threadRunDebugSchema>;

// ── Response ────────────────────────────────────────────────────────────────
// The run is the mutable unit clients observe while an assistant reply is being
// generated. On success it points at the immutable message it produced.
export const threadRunResponseSchema = z
  .object({
    id: z.string().uuid(),
    threadId: z.string().uuid(),
    status: threadRunStatusSchema,
    tier: threadModelTierSchema
      .nullable()
      .describe(
        "The capability tier this run used; `null` when the platform default applied."
      ),
    action: threadRunActionSchema
      .nullable()
      .describe(
        "What the run is waiting on while `requires_action`; else `null`."
      ),
    messageId: z
      .string()
      .uuid()
      .nullable()
      .describe(
        "The immutable assistant message this run produced; `null` until complete."
      ),
    usage: threadRunUsageSchema
      .nullable()
      .describe(
        "Token accounting, present once reported by the producer; else `null`."
      ),
    debug: threadRunDebugSchema
      .nullable()
      .describe(
        "Query trace for local/ops debugging; `null` unless the deployment enables debug."
      ),
    error: z
      .string()
      .nullable()
      .describe("Failure reason when `status: 'failed'`; else `null`."),
    clientId: z
      .string()
      .nullable()
      .describe(
        "Originating app — the OAuth client id (`azp`), first-party or third-party alike. " +
          "`null` only when the token carries no `azp`."
      ),
    subject: z
      .string()
      .describe("Who started the run, as the access token asserts them."),
    metadata: threadMetadataSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z
      .string()
      .datetime()
      .nullable()
      .describe("When the run reached a terminal state."),
  })
  .describe("A generation run on a thread.");
export type ThreadRunResponse = z.infer<typeof threadRunResponseSchema>;

// ── Create (intent) ─────────────────────────────────────────────────────────
// A run is "generate an assistant reply for this thread". What to generate is
// derived from the thread's latest message, so there is no required body.
// Identity is stamped from the token.
export const createThreadRunInputSchema = z
  .object({
    agent: threadAgentConfigSchema
      .optional()
      .describe(
        "Inline agent config to run with (instructions + tier + MCP tools). Omit for the platform default."
      ),
    tier: threadModelTierSchema
      .optional()
      .describe(
        "Capability tier to generate with; overrides the agent config's tier and the platform default."
      ),
    metadata: threadMetadataSchema
      .optional()
      .describe(
        "Opaque app data stored on the run, same contract as thread and message metadata " +
          "(e.g. prompt provenance)."
      ),
  })
  .describe(
    "Start a run. What to generate is derived from the thread's latest message; options are `agent` " +
      "(inline config) and `tier` (model capability). Status begins `queued`. Owner/client are stamped from the token."
  );
export type CreateThreadRunInput = z.infer<typeof createThreadRunInputSchema>;

// ── Complete (finalize) ─────────────────────────────────────────────────────
// The producer (the app) finalizes a pending/streaming run. The platform inserts
// the immutable assistant message and transitions the run to `complete` in one
// shot. `usage` is app-reported (advisory). A terminal run rejects this.
export const completeThreadRunInputSchema = z
  .object({
    content: z
      .string()
      .min(1)
      .describe("The assistant message body to persist."),
    metadata: threadMetadataSchema
      .optional()
      .describe(
        "Opaque app data stored on the produced message (e.g. a scene overlay for the answer)."
      ),
    references: z
      .array(threadEntityRefSchema)
      .optional()
      .describe(
        "Typed entity pointers for the produced message (e.g. highlighted graph nodes)."
      ),
    usage: threadRunUsageSchema
      .optional()
      .describe("Reported token usage for this run."),
  })
  .describe(
    "Finalize a run: persist the assistant message and mark the run complete."
  );
export type CompleteThreadRunInput = z.infer<
  typeof completeThreadRunInputSchema
>;

// ── Fail ────────────────────────────────────────────────────────────────────
export const failThreadRunInputSchema = z
  .object({
    error: z.string().min(1).describe("Why the generation failed."),
  })
  .describe("Mark a pending/streaming run as failed.");
export type FailThreadRunInput = z.infer<typeof failThreadRunInputSchema>;

// ── Submit (resume a human-in-the-loop run) ─────────────────────────────────
// Answer the question a `requires_action` run is blocked on. The platform feeds
// the answer back into the parked agent and resumes generation; the run returns
// to `running` (and may pause again). Rejected unless the run is `requires_action`.
export const submitThreadRunInputSchema = z
  .object({
    answer: z
      .string()
      .min(1)
      .describe("The user's reply to the run's pending question."),
  })
  .describe("Resume a run that is waiting on a human answer.");
export type SubmitThreadRunInput = z.infer<typeof submitThreadRunInputSchema>;

// ── List ────────────────────────────────────────────────────────────────────
export const threadRunListInputSchema = listInputSchema(threadRunList).describe(
  "List a thread's runs. PostgREST-style filters on status/createdAt."
);
export type ThreadRunListInput = z.infer<typeof threadRunListInputSchema>;

export const threadRunListResponseSchema = listResponseSchema(
  threadRunList,
  threadRunResponseSchema
).describe("Paged run list response.");
export type ThreadRunListResponse = z.infer<typeof threadRunListResponseSchema>;

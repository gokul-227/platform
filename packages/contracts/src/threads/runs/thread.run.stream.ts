import { z } from "zod";

import {
  threadEntityRefSchema,
  threadMetadataSchema,
  threadRunActionSchema,
  threadRunStatusSchema,
} from "../shared";

/**
 * The live event stream of a run, delivered over SSE (`GET …/runs/:id/stream`).
 * A discriminated union on `type`; a consumer renders `token` incrementally and
 * treats `message` / `action` / `error` as the outcome, then `done` closes it.
 * Tool events carry only the tool name — never arguments — so a graph query's
 * Cypher is not exposed to end users.
 *
 *   token   — an incremental slice of the assistant's answer
 *   tool    — the agent started calling a tool (name only)
 *   message — the finished assistant message (terminal-ish; `done` follows)
 *   action  — the agent paused to ask the user a question (HITL)
 *   error   — generation failed (clean, user-safe message)
 *   done    — stream end; carries the run's terminal/parked status
 */
export const threadRunStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), delta: z.string() }),
  z.object({ type: z.literal("tool"), name: z.string() }),
  z.object({
    type: z.literal("message"),
    content: z.string(),
    references: z.array(threadEntityRefSchema),
    metadata: threadMetadataSchema.optional(),
  }),
  z.object({ type: z.literal("action"), action: threadRunActionSchema }),
  z.object({ type: z.literal("error"), error: z.string() }),
  z.object({ type: z.literal("done"), status: threadRunStatusSchema }),
]);
export type ThreadRunStreamEvent = z.infer<typeof threadRunStreamEventSchema>;

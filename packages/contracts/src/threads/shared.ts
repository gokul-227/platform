import { type Scope, scopeSchema } from "../common/scope";
/**
 * Shared primitives for the threads domain. A thread is a chat conversation,
 * dual-scoped like files: it lives in an org (`projectId IS NULL`) or private to
 * a project. Under a thread sit two children: an immutable `thread_message` log
 * and a mutable `thread_run` lifecycle (the unit clients observe while an
 * assistant reply is being generated). Usage/token accounting lives on the run,
 * never the message; the message log is insert-once.
 */

import { z } from "zod";

// ── Roles ────────────────────────────────────────────────────────────────────
export const threadRoleSchema = z
  .enum(["user", "assistant", "system", "tool"])
  .describe("Author role of a message.");
export type ThreadRole = z.infer<typeof threadRoleSchema>;

// ── Entity references ─────────────────────────────────────────────────────────
// The general form of "this answer points at these platform entities". An app
// filters by `type` for its own concern (a viewer keeps `graph_node`). The
// platform validates the envelope and stores it; it does NOT verify the
// referenced entity exists (forward-compat, cross-table). Widen the enum to add
// targets (`project`, `thread`, ...).
export const threadEntityRefSchema = z
  .object({
    type: z.enum(["graph_node", "graph_edge", "file"]),
    id: z
      .string()
      .describe(
        "Entity id in its own namespace (e.g. IFC GlobalId for graph_node)."
      ),
  })
  .describe("A typed pointer into a platform entity.");
export type ThreadEntityRef = z.infer<typeof threadEntityRefSchema>;

// ── Message parts ─────────────────────────────────────────────────────────────
// The structured form of a message, beside the flat `content` text: tool calls,
// reasoning, attachments, approvals. Only the envelope is fixed — `type` names
// the variant, every other key rides along untouched. Like `references`, the
// platform validates the envelope and stores it; it does NOT interpret it, and
// the vocabulary belongs to the app that writes it. Insert-once like the
// message itself: parts are given at append and never edited after.
// TODO(#111): the shared part vocabulary is a pending joint design.
export const threadMessagePartSchema = z
  .object({
    type: z
      .string()
      .min(1)
      .max(64)
      .describe("Part variant, named by the writing app (e.g. 'tool-call')."),
  })
  .passthrough()
  .describe(
    "One structured piece of a message. Opaque: only `type` is validated, every other key is stored as sent."
  );
export type ThreadMessagePart = z.infer<typeof threadMessagePartSchema>;

// ── Run lifecycle ──────────────────────────────────────────────────────────────
// Full canonical status set, defined up front so widening it later is not a
// wire-breaking change. Clients treat an unknown status as in-progress.
// `requires_action` is a non-terminal pause: the agent asked the user a question
// (carried in the run's `action`) and waits for `submit` before resuming.
export const threadRunStatusSchema = z
  .enum([
    "queued",
    "running",
    "streaming",
    "requires_action",
    "complete",
    "failed",
    "cancelled",
  ])
  .describe(
    "Run lifecycle. Terminal states are `complete`, `failed`, `cancelled`; the rest are in-progress " +
      "(`requires_action` waits on the client to `submit` an answer)."
  );
export type ThreadRunStatus = z.infer<typeof threadRunStatusSchema>;

/** Terminal states: the run is over and will not change again. */
export const TERMINAL_RUN_STATUSES: readonly ThreadRunStatus[] = [
  "complete",
  "failed",
  "cancelled",
];

/**
 * Terminal-or-parked states: nothing further happens without a client call.
 * What a poll loop waits for — `requires_action` needs a `submit` to resume,
 * so treating it as "still running" would spin forever.
 */
export const SETTLED_RUN_STATUSES: readonly ThreadRunStatus[] = [
  ...TERMINAL_RUN_STATUSES,
  "requires_action",
];

// ── Run action (human-in-the-loop) ──────────────────────────────────────────────
// What the run is waiting for while `status: 'requires_action'`. A discriminated
// union so new action types (e.g. a tool-approval gate) widen it without breaking
// the wire. v1: the agent asks the user a free-text question.
export const threadRunActionSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("question"),
      prompt: z.string().describe("The question the agent is asking the user."),
    }),
  ])
  .describe("A pending human-in-the-loop request the run is blocked on.");
export type ThreadRunAction = z.infer<typeof threadRunActionSchema>;

// ── Model tier ───────────────────────────────────────────────────────────────
// Internal capability tier the calling app picks instead of a raw model id (not
// surfaced to end users). The platform maps each tier to a concrete model (any
// provider) per environment, so the backing model can change — or span
// providers — without breaking callers.
//   fast     — quick, low-cost; simple/low-stakes tasks
//   standard — balanced; the default for everyday tasks
//   advanced — most capable; complex, multi-step, or agentic work
export const threadModelTierSchema = z
  .enum(["fast", "standard", "advanced"])
  .describe(
    "Model capability tier; the platform resolves it to a concrete model per environment."
  );
export type ThreadModelTier = z.infer<typeof threadModelTierSchema>;

// ── Agent config (inline on a run) ───────────────────────────────────────────
// What the executor generates with: prompt + tier + external tool sources. An
// agent is deploy-time configuration a consumer app ships with a feature, passed
// inline at run-create — not a stored, tenant-scoped resource. Omit it (or any
// field) and the platform default applies (the built-in building-analyst prompt
// + the in-process graph tool). A published/installable agent catalog (a module
// marketplace) is a separate, later design that resolves to this same shape.
export const threadAgentToolRefSchema = z
  .object({
    type: z.literal("mcp"),
    server: z
      .string()
      .url()
      .describe("MCP server URL exposing the tools to load."),
    headers: z
      .record(z.string())
      .optional()
      .describe(
        "Static connection headers (e.g. an Authorization bearer). App-level credential; " +
          "per-user OBO delegation is a follow-up."
      ),
  })
  .describe("An external tool source the run loads (an MCP server).");
export type ThreadAgentToolRef = z.infer<typeof threadAgentToolRefSchema>;

// A specialist the supervisor can delegate to. Each sub-agent becomes a tool on
// the supervisor (named `name`, chosen via `description`); the supervisor calls
// it with a task and folds the result into its own answer.
export const threadSubAgentSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "letters, digits, '_' or '-' only (used as a tool name)"
      )
      .describe("Tool-safe name the supervisor calls this sub-agent by."),
    description: z
      .string()
      .min(1)
      .max(500)
      .describe(
        "What this sub-agent is for; the supervisor reads it to decide when to delegate."
      ),
    instructions: z
      .string()
      .min(1)
      .max(32_000)
      .describe("System prompt for the sub-agent."),
  })
  .describe("A specialist sub-agent the supervisor can delegate to.");
export type ThreadSubAgent = z.infer<typeof threadSubAgentSchema>;

export const threadAgentConfigSchema = z
  .object({
    instructions: z
      .string()
      .min(1)
      .max(32_000)
      .optional()
      .describe(
        "System prompt; replaces the default building-analyst prompt for this run."
      ),
    tier: threadModelTierSchema
      .optional()
      .describe(
        "Model tier for the run (a run-level `tier` still overrides this)."
      ),
    tools: z
      .array(threadAgentToolRefSchema)
      .max(20)
      .optional()
      .describe(
        "External MCP tool sources, loaded alongside the in-process graph tool."
      ),
    subAgents: z
      .array(threadSubAgentSchema)
      .max(8)
      .optional()
      .describe(
        "Specialist sub-agents the supervisor can delegate to; each becomes a tool. The run's " +
          "`instructions` are the supervisor's prompt."
      ),
  })
  .describe(
    "Inline agent configuration for one run (optionally a supervisor over sub-agents)."
  );
export type ThreadAgentConfig = z.infer<typeof threadAgentConfigSchema>;

// ── Run usage ──────────────────────────────────────────────────────────────────
// Per-generation accounting, attached to the run. App-reported and advisory: the
// platform does not make the model call, so it cannot stamp or verify these.
// `model` is provider-qualified (`vertex/...`, `openrouter/anthropic/...`).
export const threadRunUsageSchema = z
  .object({
    model: z
      .string()
      .describe("Provider-qualified model id, e.g. 'vertex/gemini-...'."),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  })
  .describe("LLM token accounting for one run. App-reported, advisory.");
export type ThreadRunUsage = z.infer<typeof threadRunUsageSchema>;

// ── Scope ──────────────────────────────────────────────────────────────────────
// Variant discriminator is `type` per the repo naming convention (graph and
// files scope use `type` too). A thread is either org-scoped or project-scoped.
export const threadScopeSchema = scopeSchema;
export type ThreadScope = Scope;

// ── App metadata bag ────────────────────────────────────────────────────────────
export const threadMetadataSchema = z
  .record(z.string(), z.unknown())
  .describe(
    "Free client app data the platform only stores (e.g. `{ cypher: '...' }`). Opaque."
  );

// ── Pagination ──────────────────────────────────────────────────────────────────

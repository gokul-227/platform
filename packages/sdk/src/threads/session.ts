import type {
  ThreadAgentConfig,
  ThreadEntityRef,
  ThreadModelTier,
  ThreadRunAction,
  ThreadRunDebug,
  ThreadRunStatus,
  ThreadRunStreamEvent,
  ThreadRunUsage,
  ThreadScope,
} from "@aec-craft/platform-contracts";

import type { RequestOptions } from "../common/http";

// A `Session` is the plug-and-play surface over the managed agent runtime: it
// holds a thread (created on first `send`) and any parked human-in-the-loop run,
// so a caller just does `send` / `answer` instead of orchestrating create-thread
// -> message -> run -> stream -> read. Framework-agnostic; no React.

/** What `send`/`answer` resolves to once the run settles. */
export interface Reply {
  /** The assistant's answer, or the agent's question when `requiresAction`. */
  answer: string;
  /** Query trace, present only when the deployment enables debug (`null` otherwise). */
  debug: ThreadRunDebug | null;
  /** Opaque app data on the answer's message (e.g. a scene overlay). */
  metadata: Record<string, unknown> | null;
  /** Entity references attached to the answer (graph nodes/edges, files). */
  references: ThreadEntityRef[];
  /** The agent paused for input; call `send`/`answer` again to resume the run. */
  requiresAction: boolean;
  runId: string;
  status: ThreadRunStatus;
  threadId: string;
  usage: ThreadRunUsage | null;
}

export interface SessionOptions {
  /** Agent config applied to every run (instructions, tier, MCP tools, sub-agents). */
  agent?: ThreadAgentConfig;
  /** Scope for the thread this session creates. Omit only when resuming `threadId`. */
  scope?: ThreadScope;
  /** Resume an existing thread instead of creating one on first `send`. */
  threadId?: string;
}

export interface SendOptions extends RequestOptions {
  /** Called with each token delta as the answer streams in. */
  onToken?: (delta: string) => void;
  /** Called with each tool name as the agent invokes it. */
  onTool?: (name: string) => void;
  /** Override the tier for this turn. */
  tier?: ThreadModelTier;
}

/**
 * The thread/run methods a session drives — the slice of `ThreadClient` it
 * needs. Structural so both `PlatformClient.threads` and `AgentClient.threads`
 * satisfy it without the session depending on either.
 */
interface SessionClient {
  threads: {
    create(
      scope: ThreadScope,
      input?: { title?: string }
    ): Promise<{ id: string }>;
    messages: {
      create(
        threadId: string,
        input: { role: "user" | "assistant"; content: string }
      ): Promise<unknown>;
    };
    runs: {
      create(
        threadId: string,
        input?: { agent?: ThreadAgentConfig; tier?: ThreadModelTier }
      ): Promise<{ id: string }>;
      findById(
        threadId: string,
        runId: string
      ): Promise<{
        status: ThreadRunStatus;
        action: ThreadRunAction | null;
        error: string | null;
        usage: ThreadRunUsage | null;
        debug: ThreadRunDebug | null;
      }>;
      submit(
        threadId: string,
        runId: string,
        input: { answer: string }
      ): Promise<{ id: string }>;
      stream(
        threadId: string,
        runId: string,
        options?: RequestOptions
      ): AsyncGenerator<ThreadRunStreamEvent>;
    };
  };
}

export class Session {
  private threadId: string | undefined;
  private pendingRunId: string | undefined;

  constructor(
    private readonly client: SessionClient,
    private readonly options: SessionOptions
  ) {
    this.threadId = options.threadId;
  }

  /** The thread id, once a `send` has created or resumed one. */
  get id(): string | undefined {
    return this.threadId;
  }

  /** True when the agent is waiting on an answer; the next `send` resumes that run. */
  get awaitingReply(): boolean {
    return this.pendingRunId !== undefined;
  }

  /**
   * Send a message and resolve with the reply. Creates the thread on the first
   * call. If the agent is awaiting an answer (a prior reply had `requiresAction`),
   * this resumes that run with the message instead of starting a new one.
   */
  async send(message: string, options: SendOptions = {}): Promise<Reply> {
    if (this.pendingRunId !== undefined) {
      return this.answer(message, options);
    }

    const threadId =
      this.threadId ??
      (
        await this.client.threads.create(this.requireScope(), {
          title: message.slice(0, 80),
        })
      ).id;
    this.threadId = threadId;

    await this.client.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });
    const run = await this.client.threads.runs.create(threadId, {
      ...(this.options.agent ? { agent: this.options.agent } : {}),
      ...(options.tier ? { tier: options.tier } : {}),
    });
    return this.observe(threadId, run.id, options);
  }

  /** Answer the agent's pending question (HITL), resuming the parked run. */
  async answer(answer: string, options: SendOptions = {}): Promise<Reply> {
    if (this.pendingRunId === undefined || this.threadId === undefined) {
      throw new Error("No pending question to answer.");
    }
    const run = await this.client.threads.runs.submit(
      this.threadId,
      this.pendingRunId,
      { answer }
    );
    this.pendingRunId = undefined;
    return this.observe(this.threadId, run.id, options);
  }

  /** Stream the run to settlement, then read it for the authoritative outcome. */
  private async observe(
    threadId: string,
    runId: string,
    options: SendOptions
  ): Promise<Reply> {
    let streamed = "";
    let references: ThreadEntityRef[] = [];
    let metadata: Record<string, unknown> | null = null;
    let action: ThreadRunAction | null = null;
    let streamError: string | null = null;

    const streamOptions = options.signal
      ? { signal: options.signal }
      : undefined;
    for await (const ev of this.client.threads.runs.stream(
      threadId,
      runId,
      streamOptions
    )) {
      switch (ev.type) {
        case "token":
          options.onToken?.(ev.delta);
          break;
        case "tool":
          options.onTool?.(ev.name);
          break;
        case "message":
          streamed = ev.content;
          references = ev.references;
          metadata = ev.metadata ?? null;
          break;
        case "action":
          action = ev.action;
          break;
        case "error":
          streamError = ev.error;
          break;
        default:
          // Other event types (e.g. `done`) carry no per-turn state here.
          break;
      }
    }

    // The stream carries no usage — read the settled run for it (+ authoritative status).
    const run = await this.client.threads.runs.findById(threadId, runId);
    const base = {
      references,
      metadata,
      usage: run.usage,
      debug: run.debug ?? null,
      status: run.status,
      threadId,
      runId,
    };

    if (run.status === "requires_action") {
      this.pendingRunId = runId;
      const pending = action ?? run.action;
      const prompt = pending?.type === "question" ? pending.prompt : null;
      return {
        ...base,
        answer: prompt ?? "The assistant needs more information to continue.",
        requiresAction: true,
      };
    }
    if (run.status !== "complete") {
      return {
        ...base,
        answer:
          streamError ??
          run.error ??
          "The assistant couldn't complete that. Please try again.",
        requiresAction: false,
      };
    }
    return { ...base, answer: streamed, requiresAction: false };
  }

  private requireScope(): ThreadScope {
    if (!this.options.scope) {
      throw new Error("A `scope` is required to start a new thread.");
    }
    return this.options.scope;
  }
}

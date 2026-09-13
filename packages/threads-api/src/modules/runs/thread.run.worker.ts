import type {
  ResolvedScope,
  ThreadModelTier,
} from "@aec-craft/platform-contracts";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatVertexAI } from "@langchain/google-vertexai";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  Optional,
} from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type pg from "pg";
import { type Config, ConfigToken } from "../../config/config";
import {
  type Database,
  DatabasePoolToken,
  DatabaseToken,
} from "../../database/database.module";
import { thread, threadMessage, threadRun } from "../../database/schema";

import { RunEventBus } from "./thread.run.events";
import { classifyRunFailure } from "./thread.run.failure";
import { runGraphAgent } from "./thread.run.graph";
import { ThreadRunService } from "./thread.run.service";
import {
  type RunFilesSource,
  RunFilesSourceToken,
  type RunGraphSource,
  RunGraphSourceToken,
} from "./thread.run.source";

interface TierModel {
  model: BaseChatModel;
  modelId: string;
}

/**
 * Platform policy rather than per-deployment config, so it lives beside the
 * executor and only the Vertex region comes from config. A preview model is a
 * bump here; gemini-3.1-pro-preview is global-only, so it has no EU residency.
 */
const TIER_MODEL: Record<ThreadModelTier, string> = {
  fast: "gemini-2.5-flash",
  standard: "gemini-2.5-pro",
  advanced: "gemini-2.5-pro",
};

const DEFAULT_TIER: ThreadModelTier = "standard";

/** Build the LangChain chat model for one tier. Vertex (Gemini) only for now. */
function buildTierModel(model: string, region: string): TierModel {
  return {
    model: new ChatVertexAI({ model, location: region, temperature: 0 }),
    modelId: `vertex/${model}`,
  };
}

const TICK_MS = 500;

/**
 * Claims `queued` runs and generates the reply in process, which is what makes
 * a thread managed: any client gets an answer by creating a run.
 *
 * A self-rescheduling timeout chain, armed only after the previous tick settles
 * and dormant without `config.llm`. Each tick claims one run with `FOR UPDATE
 * SKIP LOCKED` and commits it to `running` before the slow generation, so two
 * instances never double-run and a crash leaves the run for the reaper.
 *
 * Scope is pinned from the thread row, never from client input.
 */
@Injectable()
export class ThreadRunWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ThreadRunWorker.name);
  // One model per capability tier; a run resolves its tier (or the default).
  private readonly models: Record<ThreadModelTier, TierModel> | null;
  private readonly defaultTier: ThreadModelTier;
  // Durable checkpointer for pause and resume, built only when the executor is
  // active. `setup()` is idempotent and provisions its own tables.
  private readonly checkpointer: BaseCheckpointSaver | null;
  // Persist each run's Cypher trace to `thread_run.debug` (local/ops only).
  private readonly runDebug: boolean;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<unknown> | undefined;
  private stopped = false;

  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(DatabasePoolToken) pool: pg.Pool,
    @Inject(ConfigToken) config: Config,
    @Optional()
    @Inject(RunGraphSourceToken)
    private readonly graphSource: RunGraphSource | null,
    @Optional()
    @Inject(RunFilesSourceToken)
    private readonly filesSource: RunFilesSource | null,
    @Inject(ThreadRunService) private readonly runs: ThreadRunService,
    @Inject(RunEventBus) private readonly events: RunEventBus
  ) {
    const llm = config.llm;
    this.defaultTier = DEFAULT_TIER;
    this.models = llm
      ? {
          fast: buildTierModel(TIER_MODEL.fast, llm.region),
          standard: buildTierModel(TIER_MODEL.standard, llm.region),
          advanced: buildTierModel(TIER_MODEL.advanced, llm.region),
        }
      : null;
    // Reuse the workspace pool; LangGraph manages its own checkpoint tables.
    this.checkpointer = llm ? new PostgresSaver(pool) : null;
    this.runDebug = config.runDebug ?? false;
  }

  /** Persist a run's query trace when debug is enabled (local/ops only). */
  private async writeDebug(
    runId: string,
    steps: { query: string; recordCount: number; error?: string }[]
  ): Promise<void> {
    if (!this.runDebug) {
      return;
    }
    await this.db
      .update(threadRun)
      .set({ debug: { steps } })
      .where(eq(threadRun.id, runId))
      .catch(() => undefined);
  }

  async onApplicationBootstrap(): Promise<void> {
    // Dormant without an LLM: runs stay `queued` for a client to finalize.
    if (this.models) {
      if (this.checkpointer instanceof PostgresSaver) {
        await this.checkpointer.setup();
      }
      this.logger.log(
        `thread run executor starting (tick ${TICK_MS}ms, default tier ${this.defaultTier})`
      );
      this.schedule();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    await this.inFlight;
  }

  private schedule(): void {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => {
      this.inFlight = this.tick()
        .catch((error: unknown) => {
          this.logger.error(`thread run tick failed: ${String(error)}`);
        })
        .finally(() => {
          this.schedule();
        });
    }, TICK_MS);
  }

  /** Claim one queued run and generate its reply. Public so tests can drive it. */
  async tick(): Promise<number> {
    const models = this.models;
    if (!models) {
      return 0;
    }

    const claimed = await this.db.transaction(async (tx) => {
      const runs = await tx
        .select({
          id: threadRun.id,
          threadId: threadRun.threadId,
          tier: threadRun.tier,
          agentConfig: threadRun.agentConfig,
          resumeInput: threadRun.resumeInput,
        })
        .from(threadRun)
        .where(eq(threadRun.status, "queued"))
        .orderBy(asc(threadRun.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      const run = runs[0];
      if (!run) {
        return;
      }
      // Consumed on claim, so the checkpoint is fed the user's answer once.
      await tx
        .update(threadRun)
        .set({ status: "running", resumeInput: null, updatedAt: new Date() })
        .where(eq(threadRun.id, run.id));
      return run;
    });
    if (!claimed) {
      return 0;
    }

    const started = Date.now();
    try {
      // The run's inline agent config (if any) supplies instructions, a default
      // tier, and external MCP tool sources to load alongside the graph tool.
      const agentConfig = claimed.agentConfig;
      const agentInstructions = agentConfig?.instructions ?? null;
      const agentTier =
        (agentConfig?.tier as ThreadModelTier | undefined) ?? null;
      const mcpServers = agentConfig?.tools
        ?.filter((t) => t.type === "mcp")
        .map((t) => ({
          server: t.server,
          ...(t.headers ? { headers: t.headers } : {}),
        }));
      const subAgents = agentConfig?.subAgents;

      // Precedence: explicit run tier → agent config's tier → platform default.
      const tier =
        (claimed.tier as ThreadModelTier | null) ??
        agentTier ??
        this.defaultTier;
      const { model, modelId } = models[tier];

      const threadRows = await this.db
        .select({
          orgId: thread.orgId,
          projectId: thread.projectId,
          groupId: thread.groupId,
          // The asker. A background run has no request principal, so anything
          // that authorizes on the caller's behalf reads it from here.
          subject: thread.subject,
        })
        .from(thread)
        .where(eq(thread.id, claimed.threadId))
        .limit(1);
      const threadRow = threadRows[0];
      if (!threadRow) {
        throw new Error(`thread ${claimed.threadId} not found for run`);
      }

      const rows = await this.db
        .select({ role: threadMessage.role, content: threadMessage.content })
        .from(threadMessage)
        .where(eq(threadMessage.threadId, claimed.threadId))
        .orderBy(asc(threadMessage.createdAt), asc(threadMessage.id));
      const history = rows
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const projectId = threadRow.projectId;
      const subject = threadRow.subject;
      const scope: ResolvedScope | null = projectId
        ? {
            groupId: threadRow.groupId,
            orgId: threadRow.orgId,
            projectId,
          }
        : null;
      const graphSource = this.graphSource;
      // Bound to this run's scope and its caller's readable groups, resolved
      // once per run, so a revocation takes effect on the next turn.
      const filesSource = this.filesSource;
      const files =
        scope && filesSource && subject
          ? {
              context: async (input: {
                query: string;
                expand?: "none" | "neighbors" | "section";
              }) =>
                await filesSource.context(
                  scope,
                  await filesSource.readableGroups(scope, subject),
                  input
                ),
            }
          : undefined;
      const query =
        projectId && scope && graphSource
          ? (
              cypher: string,
              params?: Record<
                string,
                string | number | boolean | (string | number)[]
              >
            ) =>
              graphSource.runQuery(scope, {
                projectId,
                query: cypher,
                ...(params ? { params } : {}),
              })
          : null;
      // Writes ride the changeset path, so the audit row, `graph_version` and
      // the projection follow without extra plumbing.
      const readNode =
        scope && graphSource
          ? (nodeId: string) => graphSource.findNodeById(scope, nodeId)
          : null;
      const updateNode =
        scope && graphSource
          ? async (
              nodeId: string,
              properties: Record<string, unknown>
            ): Promise<void> => {
              await graphSource.updateNodeProperties(scope, nodeId, properties);
            }
          : null;

      // Always streaming: events publish to the bus and drop cheaply when
      // nobody is listening.
      const runId = claimed.id;
      const result = await runGraphAgent(
        {
          model,
          modelId,
          query,
          readNode,
          updateNode,
          ...(graphSource?.analyses ? { analyses: graphSource.analyses } : {}),
          ...(this.checkpointer ? { checkpointer: this.checkpointer } : {}),
          onEvent: (event) => this.events.publish(runId, event),
        },
        {
          history,
          systemOverride: agentInstructions,
          runId,
          ...(claimed.resumeInput === null
            ? {}
            : { resumeInput: claimed.resumeInput }),
          ...(mcpServers ? { mcpServers } : {}),
          ...(files ? { files } : {}),
          ...(subAgents ? { subAgents } : {}),
        }
      );

      // The agent asked the user a question: parked until `submit` re-queues it.
      if (result.status === "requires_action" && result.action) {
        await this.runs.requireAction(claimed.threadId, runId, result.action);
        await this.writeDebug(runId, result.steps);
        this.events.publish(runId, { type: "action", action: result.action });
        this.events.publish(runId, { type: "done", status: "requires_action" });
        this.logger.log(
          `thread run paused (requires_action): run=${runId} tier=${tier} ` +
            `genMs=${Date.now() - started}`
        );
        return 1;
      }

      await this.runs.complete(claimed.threadId, runId, {
        content: result.content,
        references: result.references,
        usage: result.usage,
        ...(result.overlay ? { metadata: { overlay: result.overlay } } : {}),
      });
      await this.writeDebug(runId, result.steps);
      this.events.publish(runId, {
        type: "message",
        content: result.content,
        references: result.references,
        ...(result.overlay ? { metadata: { overlay: result.overlay } } : {}),
      });
      this.events.publish(runId, { type: "done", status: "complete" });

      this.logger.log(
        `thread run complete: run=${runId} tier=${tier} model=${result.usage.model} ` +
          `steps=${result.steps.length} genMs=${Date.now() - started} ` +
          `in=${result.usage.inputTokens} out=${result.usage.outputTokens}`
      );
      return 1;
    } catch (err) {
      // A user-safe message on the run; the raw detail stays server-side.
      const raw = err instanceof Error ? err.message : String(err);
      const failure = classifyRunFailure(raw);
      this.logger.error(
        `thread run failed: run=${claimed.id} reason=${failure.reason} ${raw}`
      );
      await this.runs
        .fail(claimed.threadId, claimed.id, { error: failure.message })
        .catch(() => undefined);
      this.events.publish(claimed.id, {
        type: "error",
        error: failure.message,
      });
      this.events.publish(claimed.id, { type: "done", status: "failed" });
      return 1;
    }
  }
}

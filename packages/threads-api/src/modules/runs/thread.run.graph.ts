import type {
  CypherQueryResponse,
  GraphNodeResponse,
  ThreadRunStreamEvent,
} from "@aec-craft/platform-contracts";
import { capabilityBlocksSchema } from "@aec-craft/platform-contracts";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { tool } from "@langchain/core/tools";
import {
  type BaseCheckpointSaver,
  Command,
  interrupt,
} from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

import {
  AGENT_SYSTEM,
  HITL_HINT,
  PLAIN_SYSTEM,
  SUPERVISOR_HINT,
} from "./thread.run.prompts";
import type { RunAnalysis } from "./thread.run.source";

/**
 * A `createReactAgent` over the project graph. The model and the scoped query
 * function are supplied per run by the worker, and each tool is built with the
 * scope bound in a closure, so the agent can only read the run's project. An
 * org-scoped thread gets no graph tool and answers from general knowledge.
 */

export interface AgentStep {
  error?: string;
  query: string;
  recordCount: number;
}

/** What the agent is waiting on when it pauses for a human (HITL). */
export interface AgentAction {
  prompt: string;
  type: "question";
}

/**
 * Either a finished answer (`status: 'complete'`, `content` populated) or a pause
 * for the user (`status: 'requires_action'`, `action` populated). Usage + steps
 * accumulate across both, so a resumed run keeps accounting for its earlier legs.
 */
export interface AgentResult {
  action: AgentAction | null;
  content: string;
  /** Scene overlay from the last analysis tool that produced one. */
  overlay: Record<string, unknown> | null;
  /** What the answer drew on, resolved by type so a citation can be opened. */
  references: { type: "graph_node" | "file"; id: string }[];
  status: "complete" | "requires_action";
  steps: AgentStep[];
  usage: { model: string; inputTokens: number; outputTokens: number };
}

export interface AgentDeps {
  /**
   * Graph-backed analyses to mount as agent tools (`find_route` /
   * `spatial_egress`); an absent entry means that tool is not offered.
   */
  analyses?: { egress?: RunAnalysis; route?: RunAnalysis };
  /**
   * When set, the agent gets `ask_user` and can pause, and the checkpoint is
   * resumed later by `runId`. Omit to disable human-in-the-loop.
   */
  checkpointer?: BaseCheckpointSaver;
  model: BaseChatModel;
  /** Provider-qualified id stored on the run (e.g. `vertex/gemini-2.5-pro`). */
  modelId: string;
  /**
   * Live event sink. When set (alongside a checkpointer), generation streams:
   * `token`/`tool` events are emitted as they happen. Omit for a one-shot run.
   */
  onEvent?: (event: ThreadRunStreamEvent) => void;
  /** Read-only Cypher, already scoped to the thread's project; null is org scope. */
  query:
    | ((
        cypher: string,
        params?: Record<string, string | number | boolean | (string | number)[]>
      ) => Promise<CypherQueryResponse>)
    | null;
  /** Scoped node read from the Postgres source of truth (not the projection). */
  readNode?: ((nodeId: string) => Promise<GraphNodeResponse>) | null;
  /** Full-bag properties replacement through the changeset path. */
  updateNode?:
    | ((nodeId: string, properties: Record<string, unknown>) => Promise<void>)
    | null;
}

/** An external MCP tool source: a server URL + optional connection headers. */
export interface McpToolSource {
  headers?: Record<string, string>;
  server: string;
}

export interface AgentInput {
  /**
   * Documents the agent may search. Absent: no document tool is offered, and the
   * agent answers from the graph alone.
   */
  files?: {
    context: (input: {
      query: string;
      expand?: "none" | "neighbors" | "section";
    }) => Promise<{
      context: string;
      sources: {
        fileId: string;
        fileName: string;
        heading: string | null;
        index: number;
        page: number | null;
      }[];
    }>;
  };
  history: { role: "user" | "assistant"; content: string }[];
  /** External MCP tool sources to load alongside the in-process graph tool. */
  mcpServers?: McpToolSource[];
  /** When set, generation continues from the checkpoint rather than `history`. */
  resumeInput?: string;
  /** Checkpoint key (the run id). Required when `deps.checkpointer` is set. */
  runId?: string;
  /** Each becomes a tool the main agent delegates to; its prompt supervises. */
  subAgents?: SubAgentConfig[];
  /** Agent-config instructions that replace the default system prompt, if set. */
  systemOverride?: string | null;
}

/** A specialist the supervisor delegates to (exposed as a tool). */
export interface SubAgentConfig {
  description: string;
  instructions: string;
  name: string;
}

/** Max agent steps before LangGraph stops (1 model + 1 tool ≈ 2 graph steps/turn). */
const RECURSION_LIMIT = 16;
const CALL_TIMEOUT_MS = 30_000;

interface UsageMeta {
  usage_metadata?: { input_tokens?: number; output_tokens?: number };
}

export async function runGraphAgent(
  deps: AgentDeps,
  input: AgentInput
): Promise<AgentResult> {
  const steps: AgentStep[] = [];
  // The answer's elements, not the exploration's: discovery queries return id
  // columns too, so the last id-yielding query wins, and a node fetched by
  // `read_node` or `update_node` always counts.
  let lastQueryIds: string[] = [];
  let lastOverlay: Record<string, unknown> | null = null;
  const detailIds = new Set<string>();
  const query = deps.query;
  // Sub-agent messages are not in the supervisor's transcript, so their tokens
  // are folded into the run's usage at the end.
  let subAgentInputTokens = 0;
  let subAgentOutputTokens = 0;

  // Scope bound in a closure, and a query not referencing the injected
  // `$projectId` is rejected here as well as by the service.
  const graphTools = query
    ? [
        tool(
          async (input): Promise<string> => {
            const cypher = (input as { query?: unknown }).query;
            if (typeof cypher !== "string" || cypher.length === 0) {
              return "Error: tool call had no 'query'.";
            }
            if (!cypher.includes("$projectId")) {
              steps.push({
                query: cypher,
                recordCount: 0,
                error: "unscoped query rejected",
              });
              return "Error: every query must constrain to the project with `WHERE n.projectId = $projectId`. Add it and retry.";
            }
            try {
              const result = await query(cypher);
              const ids: string[] = [];
              for (const r of result.records) {
                const v = r.id ?? r["n.id"];
                if (typeof v === "string") {
                  ids.push(v);
                }
              }
              if (ids.length > 0) {
                lastQueryIds = ids;
              }
              steps.push({ query: cypher, recordCount: result.records.length });
              const rows = JSON.stringify(result.records);
              const preview =
                rows.length > 1500
                  ? `${rows.slice(0, 1500)}... [row preview cut off; aggregate with sum()/count() in the query, never from these rows]`
                  : rows;
              return `${result.records.length} record(s)${result.truncated ? " (server truncated the record list)" : ""}: ${preview}`;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              steps.push({ query: cypher, recordCount: 0, error: message });
              return `Query failed: ${message}`;
            }
          },
          {
            name: "query_graph",
            description:
              "Run ONE read-only openCypher query against the project's building graph and get the rows " +
              "back. EVERY query MUST constrain to the current project with `WHERE n.projectId = $projectId` " +
              "(the parameter is injected for you); an unscoped query is rejected.",
            // JSON Schema rather than zod: zod 3.25 and LangChain interop
            // badly under `exactOptionalPropertyTypes`.
            schema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "A single read-only openCypher statement.",
                },
              },
              required: ["query"],
              additionalProperties: false,
            },
          }
        ),
      ]
    : [];

  /**
   * `context` rather than an answer: this agent is already a model holding the
   * conversation, so it gets the passages and cites them itself. Each file lands
   * in `citedFiles`, which becomes the turn's `references`.
   */
  const citedFiles = new Set<string>();
  const documentTools = input.files
    ? [
        tool(
          async ({ question }: { question: string }) => {
            try {
              const { context, sources } = await (
                input.files as NonNullable<typeof input.files>
              ).context({ query: question, expand: "neighbors" });
              for (const source of sources) {
                citedFiles.add(source.fileId);
              }
              if (sources.length === 0) {
                return "No indexed document in this scope matches that question.";
              }
              const cited = sources
                .map(
                  (s) =>
                    `[${s.index}] ${s.fileName}${s.page === null ? "" : ` p.${s.page}`}`
                )
                .join("\n");
              return `${context}\n\nSources:\n${cited}`;
            } catch (err) {
              return `Document search failed: ${err instanceof Error ? err.message : String(err)}`;
            }
          },
          {
            name: "search_documents",
            description:
              "Search the documents uploaded to this scope (specifications, reports, drawings' text) and " +
              "get back the passages that answer a question, each with an [n] marker and the file and page " +
              "it came from. Use it for anything the building graph does not hold: what a specification " +
              "requires, what a standard says, what a report concluded. Cite the [n] markers in your answer. " +
              "Only documents that were indexed are searchable; a model file is not.",
            schema: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description:
                    "A natural-language question. It is matched by meaning and by term, so exact standard numbers work.",
                },
              },
              required: ["question"],
              additionalProperties: false,
            },
          }
        ),
      ]
    : [];

  // Mounted only when the host supplies them, so the agent degrades to plain
  // Cypher without them. The adapter narrows `query`: analyses bind scalars.
  const analysisContext = query
    ? {
        graph: {
          query: async (
            cypher: string,
            params?: Record<string, unknown>
          ): Promise<unknown[]> =>
            (
              await query(
                cypher,
                params as Record<
                  string,
                  string | number | boolean | (string | number)[]
                >
              )
            ).records,
        },
      }
    : null;

  // One call replaces the exploratory queries the model would otherwise write
  // for "how do I get from A to B", and blow the step budget with. The analysis
  // owns the traversal; this only adapts `query` and formats the result.
  const routeAnalysis = deps.analyses?.route;
  const routeTools =
    analysisContext && routeAnalysis
      ? [
          tool(
            async (input): Promise<string> => {
              const { from, to } = input as { from?: unknown; to?: unknown };
              if (
                typeof from !== "string" ||
                typeof to !== "string" ||
                from.length === 0 ||
                to.length === 0
              ) {
                return "Error: find_route needs 'from' and 'to' space names or ids.";
              }
              const label = `find_route ${from} -> ${to}`;
              try {
                const result = await routeAnalysis.run(
                  { from, to },
                  analysisContext
                );
                const detail = result.detail as {
                  hops?: number;
                  reachable?: boolean;
                  rooms?: string[];
                };
                if (!detail?.reachable) {
                  steps.push({ query: label, recordCount: 0 });
                  return `No route from "${from}" to "${to}" through connecting doors/openings. They may be in disconnected parts of the model, or a name did not match a space.`;
                }
                if (result.nodeIds && result.nodeIds.length > 0) {
                  lastQueryIds = result.nodeIds;
                }
                if (result.overlay) {
                  lastOverlay = result.overlay as unknown as Record<
                    string,
                    unknown
                  >;
                }
                steps.push({
                  query: label,
                  recordCount: result.nodeIds?.length ?? 0,
                });
                const rooms = detail.rooms?.filter(Boolean).join(" -> ") ?? "";
                return `Route found (${detail.hops} hop(s), approx ${result.value} ${result.unit}, straight-line over centroids): ${rooms}`;
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : String(err);
                steps.push({ query: label, recordCount: 0, error: message });
                return `find_route failed: ${message}`;
              }
            },
            {
              name: routeAnalysis.tool?.name ?? "find_route",
              description:
                routeAnalysis.tool?.description ??
                "Find the shortest route between two spaces.",
              schema: {
                type: "object",
                properties: {
                  from: {
                    type: "string",
                    description: "Start space: its name or id.",
                  },
                  to: {
                    type: "string",
                    description: "Destination space: its name or id.",
                  },
                },
                required: ["from", "to"],
                additionalProperties: false,
              },
            }
          ),
        ]
      : [];

  // Same adaptation as routing: one call answers "are all rooms within the
  // egress limit" building-wide, and the offending rooms become references.
  const egressAnalysis = deps.analyses?.egress;
  const egressTools =
    analysisContext && egressAnalysis
      ? [
          tool(
            async (input): Promise<string> => {
              const { clearance, from, limit, routes, rule } = input as {
                clearance?: unknown;
                from?: unknown;
                limit?: unknown;
                routes?: unknown;
                rule?: unknown;
              };
              const params: Record<string, unknown> = {
                ...(typeof limit === "number" ? { limit } : {}),
                ...(typeof from === "string" && from.length > 0
                  ? { from }
                  : {}),
                ...(typeof routes === "string" ? { routes } : {}),
                ...(typeof clearance === "number" ? { clearance } : {}),
                ...(typeof rule === "string" ? { rule } : {}),
              };
              const label = `spatial_egress ${JSON.stringify(params)}`;
              try {
                const result = await egressAnalysis.run(
                  params,
                  analysisContext
                );
                const detail = result.detail as {
                  beyondLimit?: { distance: number; name?: string | null }[];
                  exits?: number;
                  from?: string;
                  limit?: number;
                  note?: string;
                  rooms?: number;
                  routes?: { distance: number; exit?: string | null }[];
                  unreachable?: number;
                };
                if (detail?.note) {
                  steps.push({ query: label, recordCount: 0 });
                  return detail.note;
                }
                if (result.nodeIds && result.nodeIds.length > 0) {
                  lastQueryIds = result.nodeIds;
                }
                if (result.overlay) {
                  lastOverlay = result.overlay as unknown as Record<
                    string,
                    unknown
                  >;
                }
                steps.push({
                  query: label,
                  recordCount: result.nodeIds?.length ?? 0,
                });
                if (detail?.routes) {
                  const perExit = detail.routes
                    .map((route) => `${route.exit ?? "?"}: ${route.distance} m`)
                    .join("; ");
                  return (
                    `Exit distances from "${detail.from}" (nearest first, straight-line over centroids, approximate; ` +
                    `limit ${detail.limit} m, verdict ${result.verdict}): ${perExit}`
                  );
                }
                const offenders = detail?.beyondLimit ?? [];
                const header =
                  `Egress ${result.verdict === "pass" ? "OK" : "PROBLEMS"}: ` +
                  `${detail?.rooms} rooms, ${detail?.exits} exit(s), limit ${detail?.limit} m, ` +
                  `worst distance ${result.value} ${result.unit} (straight-line over centroids, approximate).`;
                if (result.verdict === "pass") {
                  return header;
                }
                const listed = offenders
                  .slice(0, 15)
                  .map((room) => `${room.name ?? "?"}: ${room.distance} m`)
                  .join("; ");
                const more =
                  offenders.length > 15
                    ? ` (and ${offenders.length - 15} more)`
                    : "";
                const unreachable =
                  (detail?.unreachable ?? 0) > 0
                    ? ` ${detail?.unreachable} room(s) have no route to an exit.`
                    : "";
                return `${header} Beyond limit: ${listed}${more}.${unreachable}`;
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : String(err);
                steps.push({ query: label, recordCount: 0, error: message });
                return `spatial_egress failed: ${message}`;
              }
            },
            {
              name: egressAnalysis.tool?.name ?? "spatial_egress",
              description:
                egressAnalysis.tool?.description ??
                "Check egress travel distance from every room to its nearest exit.",
              schema: {
                type: "object",
                properties: {
                  from: {
                    type: "string",
                    description:
                      "A room name or id: report that room's distance to every exit instead of the building-wide check.",
                  },
                  clearance: {
                    type: "number",
                    description:
                      "Minimum distance the path keeps from walls, in meters (omit for 0, the MBO air-line; ~0.3 for walking-line conventions).",
                  },
                  limit: {
                    type: "number",
                    description:
                      "Maximum travel distance in meters (omit for the default 35, German MBO).",
                  },
                  routes: {
                    type: "string",
                    enum: ["worst", "problems", "all"],
                    description:
                      "Building-wide: which nearest-exit routes to include in the overlay (default worst).",
                  },
                  rule: {
                    type: "string",
                    enum: ["mbo-standard", "mvstaettvo-assembly"],
                    description:
                      "Check a regulation preset instead of a bare limit: MBO standard buildings (35 m air-line AND 52.5 m walking) or MVStättVO assembly (30 m Lauflinie). Building-wide only.",
                  },
                },
                additionalProperties: false,
              },
            }
          ),
        ]
      : [];

  // From the Postgres source of truth, so the model reads the blocks that exist
  // instead of guessing field names.
  const readNode = deps.readNode ?? null;
  const readNodeTools = readNode
    ? [
        tool(
          async (input): Promise<string> => {
            const { id, blocks } = input as { id?: unknown; blocks?: unknown };
            if (typeof id !== "string" || id.length === 0) {
              return "Error: provide the node 'id'.";
            }
            try {
              const node = await readNode(id);
              const bag = (node.properties ?? {}) as Record<string, unknown>;
              const inventory = Object.keys(bag);
              const wanted =
                Array.isArray(blocks) && blocks.length > 0
                  ? blocks.filter(
                      (block): block is string => typeof block === "string"
                    )
                  : inventory;
              const properties = Object.fromEntries(
                wanted
                  .filter((block) => block in bag)
                  .map((block) => [block, bag[block]])
              );
              detailIds.add(node.id);
              steps.push({ query: `read_node ${id}`, recordCount: 1 });
              return JSON.stringify({
                id: node.id,
                class: node.class,
                name: node.name,
                type: node.type,
                phase: node.phase,
                blocks: inventory,
                properties,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              steps.push({
                query: `read_node ${id}`,
                recordCount: 0,
                error: message,
              });
              return `read_node failed: ${message}`;
            }
          },
          {
            name: "read_node",
            description:
              "Read ONE node's full current state from the source of truth by id: core fields, its " +
              "capability-block inventory (`blocks`), and block contents. Pass `blocks` to fetch only " +
              "specific blocks (sparse access). Prefer this over Cypher once you have an id; it is always " +
              "fresh (no sync lag).",
            schema: {
              type: "object",
              properties: {
                id: { type: "string", description: "Node id (uuid)." },
                blocks: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Optional: return only these capability blocks (e.g. ['envelope']).",
                },
              },
              required: ["id"],
              additionalProperties: false,
            },
          }
        ),
      ]
    : [];

  // Validated against the block schemas, then written through the changeset
  // path, which adds the audit row and `graph_version`.
  const updateNode = deps.updateNode ?? null;
  const updateNodeTools =
    readNode && updateNode
      ? [
          tool(
            async (input): Promise<string> => {
              const { id, block, set, unset } = input as {
                id?: unknown;
                block?: unknown;
                set?: unknown;
                unset?: unknown;
              };
              if (typeof id !== "string" || id.length === 0) {
                return "Error: provide the node 'id'.";
              }
              if (typeof block !== "string" || block.length === 0) {
                return "Error: provide the capability 'block' to update.";
              }
              const label = `update_node ${id} ${block}`;
              try {
                const node = await readNode(id);
                const bag = {
                  ...((node.properties ?? {}) as Record<string, unknown>),
                };
                const existing = bag[block];
                const current =
                  existing &&
                  typeof existing === "object" &&
                  !Array.isArray(existing)
                    ? (existing as Record<string, unknown>)
                    : {};
                const merged: Record<string, unknown> = {
                  ...current,
                  ...(set && typeof set === "object" && !Array.isArray(set)
                    ? (set as Record<string, unknown>)
                    : {}),
                };
                if (Array.isArray(unset)) {
                  for (const key of unset) {
                    if (typeof key === "string") {
                      delete merged[key];
                    }
                  }
                }
                if (Object.keys(merged).length === 0) {
                  delete bag[block];
                } else {
                  bag[block] = merged;
                }
                const parsed = capabilityBlocksSchema.safeParse(bag);
                if (!parsed.success) {
                  const issue = parsed.error.issues[0];
                  const where = issue?.path.join(".") ?? block;
                  steps.push({
                    query: label,
                    recordCount: 0,
                    error: `validation: ${where}`,
                  });
                  return `Validation failed at ${where}: ${issue?.message ?? "invalid value"}. Fix the value and retry.`;
                }
                await updateNode(id, bag);
                detailIds.add(id);
                steps.push({ query: label, recordCount: 1 });
                return JSON.stringify({ ok: true, id, block, value: merged });
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : String(err);
                steps.push({ query: label, recordCount: 0, error: message });
                return `update_node failed: ${message}`;
              }
            },
            {
              name: "update_node",
              description:
                "Change ONE node's data, one capability block at a time: merges `set` into the block and " +
                "removes `unset` keys. Validated against the schema; the write is audited, versioned, " +
                "and reflected in the viewer. Use ONLY when the user explicitly asked to change data; when " +
                "in doubt, ask first.",
              schema: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Node id (uuid)." },
                  block: {
                    type: "string",
                    description:
                      "Capability block key to patch (e.g. 'programme').",
                  },
                  set: {
                    type: "object",
                    additionalProperties: true,
                    description: "Fields to merge into the block.",
                  },
                  unset: {
                    type: "array",
                    items: { type: "string" },
                    description: "Field names to remove from the block.",
                  },
                },
                required: ["id", "block"],
                additionalProperties: false,
              },
            }
          ),
        ]
      : [];

  // With a checkpointer wired, `interrupt()` suspends the graph and the run
  // returns to the worker as `requires_action`; `Command({resume})` feeds the
  // answer back.
  const hitlTools = deps.checkpointer
    ? [
        tool(
          (input): string => {
            const question = (input as { question?: unknown }).question;
            const prompt = typeof question === "string" ? question : "";
            // Suspends here on first hit; on resume returns the user's answer.
            const answer = interrupt({ type: "question", prompt });
            return typeof answer === "string" ? answer : JSON.stringify(answer);
          },
          {
            name: "ask_user",
            description:
              "Ask the user ONE clarifying question and wait for their answer. Use only when the " +
              "request is genuinely ambiguous and you cannot proceed; prefer answering directly.",
            schema: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description: "A single, specific question for the user.",
                },
              },
              required: ["question"],
              additionalProperties: false,
            },
          }
        ),
      ]
    : [];

  // A sub-agent is a plain ReAct agent over the same model and graph tool with
  // its own prompt, invoked in isolation and returning one answer. Its steps and
  // node refs flow through the shared closure; its tokens are counted apart.
  const subAgentTools = (input.subAgents ?? []).map((sub) => {
    const subAgent = createReactAgent({
      llm: deps.model,
      // Read-only delegation: sub-agents explore and read, never mutate.
      tools: [...graphTools, ...routeTools, ...egressTools, ...readNodeTools],
      prompt: sub.instructions,
    });
    return tool(
      async (toolInput): Promise<string> => {
        const task = (toolInput as { task?: unknown }).task;
        if (typeof task !== "string" || task.length === 0) {
          return "Error: provide a 'task' string for the sub-agent.";
        }
        const result = await subAgent.invoke(
          { messages: [{ role: "user", content: task }] },
          {
            recursionLimit: RECURSION_LIMIT,
            signal: AbortSignal.timeout(CALL_TIMEOUT_MS * RECURSION_LIMIT),
          }
        );
        for (const m of result.messages) {
          const u = (m as UsageMeta).usage_metadata;
          if (u) {
            subAgentInputTokens += u.input_tokens ?? 0;
            subAgentOutputTokens += u.output_tokens ?? 0;
          }
        }
        const last = result.messages.at(-1);
        return typeof last?.content === "string" ? last.content : "";
      },
      {
        name: sub.name,
        description: sub.description,
        schema: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "The focused task to delegate to this sub-agent.",
            },
          },
          required: ["task"],
          additionalProperties: false,
        },
      }
    );
  });

  // Loaded alongside the in-process graph tool. Connection auth is the
  // app-level headers on each ref; the client is closed after the run.
  let mcpClient: MultiServerMCPClient | undefined;
  if (input.mcpServers && input.mcpServers.length > 0) {
    mcpClient = new MultiServerMCPClient(
      Object.fromEntries(
        input.mcpServers.map((s, i) => [
          `mcp_${i}`,
          {
            transport: "http" as const,
            url: s.server,
            ...(s.headers ? { headers: s.headers } : {}),
          },
        ])
      )
    );
  }

  try {
    const mcpTools = mcpClient ? await mcpClient.getTools() : [];
    const tools = [
      ...graphTools,
      ...routeTools,
      ...egressTools,
      ...readNodeTools,
      ...documentTools,
      ...updateNodeTools,
      ...hitlTools,
      ...subAgentTools,
      ...mcpTools,
    ];

    let basePrompt =
      input.systemOverride ?? (query ? AGENT_SYSTEM : PLAIN_SYSTEM);
    if (subAgentTools.length > 0) {
      basePrompt += SUPERVISOR_HINT;
    }

    const agent = createReactAgent({
      llm: deps.model,
      tools,
      prompt: deps.checkpointer ? basePrompt + HITL_HINT : basePrompt,
      ...(deps.checkpointer ? { checkpointer: deps.checkpointer } : {}),
    });

    // A resume feeds the answer back into the parked checkpoint; a fresh run
    // replays the history. The checkpoint is keyed by the run id.
    const invokeInput =
      input.resumeInput === undefined
        ? {
            messages: input.history.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }
        : new Command({ resume: input.resumeInput });

    const config = {
      recursionLimit: RECURSION_LIMIT,
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS * RECURSION_LIMIT),
      ...(deps.checkpointer
        ? { configurable: { thread_id: input.runId } }
        : {}),
    };

    // Two paths, one result shape: streaming emits events live and then reads
    // the checkpoint for the authoritative messages and any pending interrupt,
    // while a plain invoke returns both directly.
    let messages: { content?: unknown }[];
    let interruptValue: unknown;
    if (deps.onEvent && deps.checkpointer) {
      const onEvent = deps.onEvent;
      for await (const ev of agent.streamEvents(invokeInput, {
        ...config,
        version: "v2",
      })) {
        if (ev.event === "on_chat_model_stream") {
          const chunk = ev.data?.chunk as { content?: unknown } | undefined;
          const text = typeof chunk?.content === "string" ? chunk.content : "";
          if (text) {
            onEvent({ type: "token", delta: text });
          }
        } else if (ev.event === "on_tool_start" && ev.name) {
          // Name only; never tool args, so a graph query's Cypher isn't exposed.
          onEvent({ type: "tool", name: ev.name });
        }
      }
      const snapshot = await agent.getState({
        configurable: { thread_id: input.runId },
      });
      messages = (snapshot.values.messages ?? []) as { content?: unknown }[];
      interruptValue = snapshot.tasks?.[0]?.interrupts?.[0]?.value;
    } else {
      const result = await agent.invoke(invokeInput, config);
      messages = result.messages;
      interruptValue = (result as { __interrupt__?: { value?: unknown }[] })
        .__interrupt__?.[0]?.value;
    }

    let inputTokens = subAgentInputTokens;
    let outputTokens = subAgentOutputTokens;
    for (const m of messages) {
      const u = (m as UsageMeta).usage_metadata;
      if (u) {
        inputTokens += u.input_tokens ?? 0;
        outputTokens += u.output_tokens ?? 0;
      }
    }
    const usage = { model: deps.modelId, inputTokens, outputTokens };
    const references = [
      ...[...new Set([...lastQueryIds, ...detailIds])].map((id) => ({
        type: "graph_node" as const,
        id,
      })),
      ...[...citedFiles].map((id) => ({ type: "file" as const, id })),
    ];

    // Paused on `ask_user`: the interrupt value is the question, and `submit`
    // is how the client answers it.
    if (interruptValue) {
      const askedPrompt = (interruptValue as { prompt?: unknown }).prompt;
      const prompt =
        typeof askedPrompt === "string" && askedPrompt.length > 0
          ? askedPrompt
          : "Could you clarify your request?";
      return {
        status: "requires_action",
        content: "",
        action: { type: "question", prompt },
        overlay: null,
        references,
        usage,
        steps,
      };
    }

    const last = messages.at(-1);
    const content =
      (typeof last?.content === "string" ? last.content : "") ||
      "I couldn't find an answer to that in this model.";

    return {
      status: "complete",
      content,
      action: null,
      overlay: lastOverlay,
      references,
      usage,
      steps,
    };
  } finally {
    await mcpClient?.close();
  }
}

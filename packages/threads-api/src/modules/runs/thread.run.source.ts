import type {
  CypherQueryResponse,
  GraphNodeResponse,
  ResolvedScope,
} from "@aec-craft/platform-contracts";

export interface RunGraphQueryInput {
  params?: Record<string, string | number | boolean | (string | number)[]>;
  projectId: string;
  query: string;
}

/**
 * A graph-backed analysis the run executor can mount as an agent tool. Declared
 * structurally, so an analysis package satisfies it without being depended on.
 */
export interface RunAnalysis {
  run(
    params: Record<string, unknown>,
    context: {
      graph: {
        query: (
          cypher: string,
          params?: Record<string, unknown>
        ) => Promise<unknown[]>;
      };
    }
  ): Promise<{
    detail?: unknown;
    nodeIds?: string[];
    overlay?: unknown;
    unit?: string;
    value?: number | string | null;
    verdict?: "pass" | "fail" | null;
  }>;
  tool?: { description: string; name: string };
}

/**
 * Provided by the host, which adapts graph-api's services today and could
 * satisfy it over HTTP. Without a provider the executor runs no graph tools.
 */
export interface RunGraphSource {
  /** Analyses the host may supply as agent tools; absent, none are offered. */
  analyses?: { egress?: RunAnalysis; route?: RunAnalysis };
  /** Scoped node read from the relational source of truth (fresh, no sync lag). */
  findNodeById(
    scope: ResolvedScope,
    nodeId: string
  ): Promise<GraphNodeResponse>;
  /** Read-only Cypher over the projected graph, scoped to the run's project. */
  runQuery(
    scope: ResolvedScope,
    input: RunGraphQueryInput
  ): Promise<CypherQueryResponse>;
  /** Full-bag properties replacement through the governed changeset path. */
  updateNodeProperties(
    scope: ResolvedScope,
    nodeId: string,
    properties: Record<string, unknown>
  ): Promise<void>;
}

export const RunGraphSourceToken = Symbol.for(
  "@aec-craft/platform-threads-api:run-graph-source"
);

/**
 * In-process rather than over MCP: that connection's credential is app-level, so
 * every thread's retrieval would run as one shared identity and the in-query
 * group filter would be evaluated against the wrong principal. Here the executor
 * already holds the run's scope and its caller's readable groups.
 */
export interface RunFilesSource {
  /**
   * `context` rather than `ask`: the agent is already a model, and a second
   * generation on prose it would rewrite loses the conversation it holds.
   */
  context(
    scope: ResolvedScope,
    readableGroups: string[],
    input: {
      query: string;
      topK?: number;
      expand?: "none" | "neighbors" | "section";
    }
  ): Promise<{
    context: string;
    sources: {
      fileId: string;
      fileName: string;
      heading: string | null;
      index: number;
      page: number | null;
    }[];
  }>;
  /**
   * `subject` is what the authorization store keys on. A background run has no
   * request principal, so the asker travels with the work.
   */
  readableGroups(scope: ResolvedScope, subject: string): Promise<string[]>;
}

export const RunFilesSourceToken = Symbol.for(
  "@aec-craft/platform-threads-api:run-files-source"
);

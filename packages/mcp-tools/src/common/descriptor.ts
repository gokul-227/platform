/**
 * Tool descriptor — the typed declaration of a single MCP tool.
 *
 * Each tool maps to one REST operation on the resource server that hosts them.
 * The `/mcp` endpoint loads the descriptor list at boot and exposes them via
 * MCP's `tools/list` + `tools/call` protocol surface. Add a new tool by creating
 * a file under `src/<domain>/` + exporting it from the domain barrel.
 *
 * A descriptor is intentionally narrower than the REST contract: it names the
 * tool from the agent's perspective (`graph_nodes_list`, not
 * `GET /graph/nodes`), captures the input + output zod schemas, and names the
 * method + path to dispatch to. Authorization stays on that route, which the
 * dispatch re-enters with its guards intact; the `scopes` field is a
 * pre-flight gate, not the source of truth.
 */

import type { FilterSpec } from "@aec-craft/platform-contracts";
import type { z } from "zod";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ResourceId = "api";

/**
 * REST endpoint on the resource server.
 *
 * `path` may contain `{paramName}` placeholders substituted from the validated
 * input args at dispatch time. Any input field whose name
 * matches a `{placeholder}` is pulled out of the args, URL-encoded, and
 * inlined into the path; remaining fields become query-string parameters on
 * GET, JSON body on POST/PATCH. The descriptor never lists placeholders
 * separately — the path is the source of truth, parsed at runtime.
 *
 *   { method: "GET", path: "/graph/nodes" }                  // static
 *   { method: "GET", path: "/graph/nodes/{nodeId}" }         // templated
 *   { method: "PATCH", path: "/orgs/{orgId}/members/{userId}" }
 */
export interface Endpoint {
  readonly method: HttpMethod;
  /**
   * Absolute path on the resource server. May contain `{paramName}`
   * placeholders matching fields on the descriptor's `inputSchema`.
   */
  readonly path: string;
}

export interface ToolDescriptor<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  /**
   * Plain-English purpose. The agent reads this to decide whether to call
   * the tool, so it should answer "what does this do" + "when would I use
   * it" in one or two sentences.
   */
  readonly description: string;
  /** REST endpoint on the resource server (method + path, may be templated). */
  readonly endpoint: Endpoint;
  /**
   * Optional reference to the `@aec-craft/platform-contracts` filter spec
   * backing this tool's list endpoint. When provided, the manifest builder
   * appends a generated `Filters: <field> (<ops>); ...` (and `Sortable: ...`)
   * line to the tool description so the agent gets a precise field-level
   * allow-list without per-tool description authors repeating it by hand.
   * `platform-contracts` is the single source of truth; adding a new op
   * on a column auto-propagates to every tool description.
   *
   * Omit for non-list tools (e.g. `graph_nodes_get`) — they have nothing to
   * filter against.
   */
  readonly filterSpec?: FilterSpec;
  /**
   * Input args. Validated against this at `tools/call` time; on
   * success, args are split into path / query / body per the endpoint spec
   * (v1: GET only, every input field becomes a query param).
   */
  readonly inputSchema: TInput;
  /**
   * Tool name as the agent sees it. MCP convention is snake_case, dotted
   * paths discouraged. Must be unique across the whole manifest.
   */
  readonly name: string;
  /**
   * Expected response shape. The route's response is validated against this
   * before it reaches the agent; a mismatch is surfaced as a tool-call error
   * rather than a silent shape drift.
   */
  readonly outputSchema: TOutput;
  /** Which resource server owns this tool. */
  readonly resource: ResourceId;
  /**
   * Minimum OAuth scopes the caller's token must hold for the call to be
   * dispatched. The route still enforces its own permission model; this is a
   * cheap fail-fast in front of it.
   */
  readonly scopes: readonly string[];
}

/**
 * Trivial identity helper. Exists for documentation symmetry with
 * `defineFilters` in `@aec-craft/platform-contracts` and to give a stable
 * place to add invariants (e.g. asserting `name` is snake_case) when they're
 * worth checking at definition time.
 */
export function defineTool<
  TInput extends z.ZodTypeAny,
  TOutput extends z.ZodTypeAny,
>(
  descriptor: ToolDescriptor<TInput, TOutput>
): ToolDescriptor<TInput, TOutput> {
  return descriptor;
}

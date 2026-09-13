/**
 * MCP dispatch, hosted by the API that owns the tools.
 *
 * Three methods:
 *   - `initialize`   → server info + capabilities (handshake).
 *   - `tools/list`   → the static manifest derived from `ALL_TOOLS`.
 *   - `tools/call`   → validate args, execute against this API, validate the
 *                      response, wrap it as MCP `content`.
 *
 * A tool call re-enters this service's own HTTP stack on loopback rather than
 * calling the module services directly. That keeps one definition of what a
 * tool does: the route it names in its descriptor, with the guard, the
 * authorization check and the validation pipe that route already carries. The
 * alternative duplicates every tool's worth of scope resolution and permission
 * checks beside the controllers that already perform them, which is the kind of
 * second copy that drifts silently and fails open.
 *
 * The caller's bearer is reused for that request. This is not the passthrough
 * the specification forbids: passthrough is a server accepting a token minted
 * for someone else and forwarding it onward. Here the MCP endpoint and the
 * route it calls are the same resource server with the same audience, so the
 * token was issued to the server presenting it and there is nothing to
 * exchange. That is the property #167 moved this endpoint to obtain.
 *
 * Cost of the loopback hop: a tool call spends two per-principal throttle slots
 * rather than one, so an agent's effective tool budget is half the configured
 * limit.
 */

import {
  ALL_TOOLS,
  buildToolsListPayload,
  type ToolDescriptor,
} from "@aec-craft/platform-mcp-tools";
import { Injectable, Logger } from "@nestjs/common";

import {
  isJsonRpcRequest,
  JsonRpcCodes,
  type JsonRpcRequest,
  type JsonRpcResponse,
  rpcError,
  rpcSuccess,
} from "./jsonrpc";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "@aec-craft/api";
const SERVER_VERSION = "0.0.0";

/**
 * Loaded once per session by spec-compliant MCP clients (Claude Code,
 * Claude Desktop). Carries the wire-grammar prelude that would otherwise
 * be repeated in every tool description — the per-tool descriptions then
 * stick to what's actually tool-specific (which fields, what they mean)
 * and the manifest's auto-generated `Filters: ...` line carries the
 * allow-list. Clients that ignore this field still get correct per-tool
 * info because the field list lives in each tool's description too;
 * `instructions` is the token-saver, not the source of truth.
 */
const SERVER_INSTRUCTIONS = [
  "List endpoints accept PostgREST-style `?field=op.value` filters: " +
    "`eq.x` (bare-value shorthand `?field=x` works too), " +
    "`in.(a,b,c)` for set membership (parens required), " +
    "`startsWith.x` / `endsWith.x` / `contains.x` (case-insensitive ILIKE), " +
    "`gt.x` / `gte.x` / `lt.x` / `lte.x` for date + number ranges.",
  "Sort with repeatable `?sort=field:asc|desc`. " +
    "Paginate with `?limit=N` (max 200, default 50) + `?cursor=<opaque>` " +
    "returned by the previous page.",
  "Graph tools (`/graph/nodes`, `/graph/edges`) accept JSONB-path filters on " +
    "the `properties` column: `?properties=hasKey.envelope` for cheap key " +
    "existence, `?properties->key=op.value` for path-walked comparisons. " +
    "Response projection on the `properties` bag uses repeatable " +
    "`?select=key1&select=key2`.",
  "Each tool's own description lists which fields it supports filtering on " +
    "and which ops are allowed per field.",
].join("\n\n");

interface ToolsCallParams {
  readonly arguments?: unknown;
  readonly name?: unknown;
}

interface McpContent {
  readonly text: string;
  readonly type: "text";
}

interface ToolCallResult {
  readonly content: readonly McpContent[];
  readonly isError?: boolean;
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private readonly toolsByName: Map<string, ToolDescriptor>;
  private readonly toolsListCache: ReturnType<typeof buildToolsListPayload>;
  private readonly baseUrl: string;

  constructor() {
    this.toolsByName = new Map(ALL_TOOLS.map((t) => [t.name, t]));
    this.toolsListCache = buildToolsListPayload(ALL_TOOLS);
    this.baseUrl = loopbackBaseUrl();
  }

  async handle(
    rawMessage: unknown,
    bearerToken: string
  ): Promise<JsonRpcResponse> {
    if (!isJsonRpcRequest(rawMessage)) {
      return rpcError(
        null,
        JsonRpcCodes.InvalidRequest,
        "Not a JSON-RPC 2.0 request"
      );
    }
    const { id, method } = rawMessage;

    switch (method) {
      case "initialize":
        return rpcSuccess(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions: SERVER_INSTRUCTIONS,
        });

      case "tools/list":
        return rpcSuccess(id, this.toolsListCache);

      case "tools/call":
        return await this.handleToolsCall(rawMessage, bearerToken);

      default:
        return rpcError(
          id,
          JsonRpcCodes.MethodNotFound,
          `Method not found: ${method}`
        );
    }
  }

  private async handleToolsCall(
    message: JsonRpcRequest,
    bearerToken: string
  ): Promise<JsonRpcResponse> {
    const { id } = message;
    const { name, arguments: args } = (message.params ?? {}) as ToolsCallParams;

    if (typeof name !== "string") {
      return rpcError(
        id,
        JsonRpcCodes.InvalidParams,
        "tools/call: `name` is required"
      );
    }
    const tool = this.toolsByName.get(name);
    if (!tool) {
      return rpcError(id, JsonRpcCodes.MethodNotFound, `Unknown tool: ${name}`);
    }

    const parsed = tool.inputSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return rpcError(
        id,
        JsonRpcCodes.InvalidParams,
        `Input validation failed for tool ${name}`,
        parsed.error.flatten()
      );
    }

    try {
      const result = await this.callRoute(tool, parsed.data, bearerToken);
      return rpcSuccess<ToolCallResult>(id, result);
    } catch (err) {
      const message_ = err instanceof Error ? err.message : String(err);
      this.logger.warn({ tool: name, err: message_ }, "tool call failed");
      return rpcError(
        id,
        JsonRpcCodes.ToolExecution,
        `Tool ${name} failed: ${message_}`
      );
    }
  }

  private async callRoute(
    tool: ToolDescriptor,
    args: unknown,
    bearerToken: string
  ): Promise<ToolCallResult> {
    const { path, remaining } = fillPathTemplate(tool.endpoint.path, args);
    const query = tool.endpoint.method === "GET" ? qs(remaining) : "";
    const url = `${this.baseUrl}${path}${query}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${bearerToken}`,
      // Marks the call as tool-originated for logs and audit, distinguishing it
      // from the same route reached directly by a client.
      "X-Origin": "mcp",
      Accept: "application/json",
    };
    const init: RequestInit = { method: tool.endpoint.method, headers };
    if (tool.endpoint.method !== "GET") {
      headers["Content-Type"] = "application/json";
      // Body is the remaining args (after path templates are filled).
      init.body = JSON.stringify(remaining);
    }

    const response = await fetch(url, init);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Route returned ${response.status}: ${text.slice(0, 256)}`
      );
    }
    const json: unknown = text ? JSON.parse(text) : null;
    const validated = tool.outputSchema.safeParse(json);
    if (!validated.success) {
      throw new Error(
        `Response shape mismatch for ${tool.name}: ${JSON.stringify(validated.error.flatten())}`
      );
    }
    return {
      content: [
        { type: "text", text: JSON.stringify(validated.data, null, 2) },
      ],
    };
  }
}

/**
 * Substitute `{placeholder}` segments in a path template with values from
 * `args`, URL-encoded. Returns the filled path plus the remaining args
 * object (path-consumed fields removed) so the caller can route the rest
 * into the query string or JSON body.
 *
 * Throws if a placeholder has no matching arg — treated as a tool-execution
 * failure (zod input validation should have caught it upstream, but defense in
 * depth keeps us out of "GET /orgs/undefined" land).
 *
 * Templates with no placeholders pass through unchanged with `remaining`
 * equal to the original args.
 */
export function fillPathTemplate(
  template: string,
  args: unknown
): { readonly path: string; readonly remaining: Record<string, unknown> } {
  const argRecord =
    args && typeof args === "object"
      ? { ...(args as Record<string, unknown>) }
      : {};
  const placeholderRe = /\{(\w+)\}/g;
  const path = template.replace(placeholderRe, (_match, key: string) => {
    const value = argRecord[key];
    if (value === undefined || value === null) {
      throw new Error(
        `Missing path parameter '${key}' for template '${template}'`
      );
    }
    delete argRecord[key];
    return encodeURIComponent(primitiveToString(value));
  });
  return { path, remaining: argRecord };
}

/**
 * Tiny query-string serializer (mirrors @aec-craft/platform-sdk's qs.ts).
 * Repeats arrays as `?k=a&k=b`; skips undefined / null. Only primitives +
 * string arrays survive cleanly through URL transport.
 */
function qs(input: unknown): string {
  if (!input || typeof input !== "object") {
    return "";
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === undefined || v === null) {
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        params.append(k, primitiveToString(item));
      }
    } else {
      params.append(k, primitiveToString(v));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * Only primitives round-trip cleanly through a URL. Tool descriptors validate
 * at the input boundary, so anything reaching `qs` should be a string / number
 * / boolean — throw on the rest so a future descriptor shipping a nested object
 * on the wire fails loudly here instead of serializing as `[object Object]`.
 */
function primitiveToString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new Error(`qs: unsupported value type for URL query: ${typeof value}`);
}

/**
 * Loopback, not `PUBLIC_URL`: a tool call must not leave the container and come
 * back through DNS and the load balancer, which adds a network dependency and a
 * WAF pass to every call and would resolve to a different revision mid-deploy.
 *
 * The port is read the way `main.ts` reads it, so the two cannot disagree.
 */
function loopbackBaseUrl(): string {
  return `http://127.0.0.1:${String(Number(process.env.PORT ?? 3100))}`;
}

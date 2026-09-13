/**
 * Minimal JSON-RPC 2.0 envelope types + helpers.
 *
 * MCP carries every interaction (initialize / tools/list / tools/call / etc.)
 * as a JSON-RPC 2.0 message over HTTP. v1 implements only what we need to
 * advertise the manifest and dispatch tool calls; notifications + batching
 * are deferred until a real tool needs them.
 *
 * MCP-specific error codes (above the JSON-RPC reserved range):
 *   -32600 Invalid Request
 *   -32601 Method not found
 *   -32602 Invalid params
 *   -32603 Internal error
 *   -32000 Tool execution failure (our extension)
 */

export interface JsonRpcRequest {
  readonly id: string | number | null;
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface JsonRpcSuccess<T = unknown> {
  readonly id: string | number | null;
  readonly jsonrpc: "2.0";
  readonly result: T;
}

export interface JsonRpcError {
  readonly error: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
  readonly id: string | number | null;
  readonly jsonrpc: "2.0";
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError;

export const JsonRpcCodes = {
  InvalidRequest: -32_600,
  MethodNotFound: -32_601,
  InvalidParams: -32_602,
  InternalError: -32_603,
  ToolExecution: -32_000,
} as const;

export function rpcSuccess<T>(
  id: string | number | null,
  result: T
): JsonRpcSuccess<T> {
  return { jsonrpc: "2.0", id, result };
}

export function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcError {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    v.jsonrpc === "2.0" &&
    typeof v.method === "string" &&
    (v.id === null || typeof v.id === "string" || typeof v.id === "number")
  );
}

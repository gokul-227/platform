import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { McpService } from "../../../src/mcp/mcp.service";

const TEST_TOKEN = "test-bearer-token";
const TEST_PORT = "3199";

describe("McpService", () => {
  let service: McpService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.PORT = TEST_PORT;
    service = new McpService();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initialize returns protocol version + capabilities + server info + instructions", async () => {
    const res = await service.handle(
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      TEST_TOKEN
    );
    expect("result" in res).toBe(true);
    const result = (res as { result: Record<string, unknown> }).result;
    expect(result.protocolVersion).toBeTypeOf("string");
    expect(result.capabilities).toMatchObject({
      tools: { listChanged: false },
    });
    expect(result.serverInfo).toMatchObject({ name: "@aec-craft/api" });
    // The grammar prelude lives here once instead of being repeated in every
    // tool description; the agent loads it at session start.
    expect(result.instructions).toBeTypeOf("string");
    expect(result.instructions).toContain("PostgREST");
    expect(result.instructions).toContain("?sort=");
    expect(result.instructions).toContain("?properties=hasKey");
  });

  it("tools/list returns the cached manifest including graph_nodes_list", async () => {
    const res = await service.handle(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      TEST_TOKEN
    );
    expect("result" in res).toBe(true);
    const { tools } = (res as { result: { tools: { name: string }[] } }).result;
    expect(tools.map((t) => t.name)).toContain("graph_nodes_list");
  });

  it("unknown method returns MethodNotFound", async () => {
    const res = await service.handle(
      { jsonrpc: "2.0", id: 3, method: "totally/madeup" },
      TEST_TOKEN
    );
    expect("error" in res).toBe(true);
    const { error } = res as { error: { code: number; message: string } };
    expect(error.code).toBe(-32_601);
  });

  it("malformed message returns InvalidRequest", async () => {
    const res = await service.handle(
      { jsonrpc: "1.0", method: "tools/list" },
      TEST_TOKEN
    );
    expect("error" in res).toBe(true);
    expect((res as { error: { code: number } }).error.code).toBe(-32_600);
  });

  it("tools/call with unknown tool returns MethodNotFound", async () => {
    const res = await service.handle(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "nope_not_a_tool", arguments: {} },
      },
      TEST_TOKEN
    );
    expect("error" in res).toBe(true);
    expect((res as { error: { code: number } }).error.code).toBe(-32_601);
  });

  it("tools/call validates input against the descriptor schema", async () => {
    // graph_nodes_get needs the nodeId its path templates in. A scoped list
    // cannot stand in: its scope pair is optional-each in the schema, because
    // the exclusivity is a refinement and a descriptor takes a plain object.
    const res = await service.handle(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "graph_nodes_get", arguments: {} },
      },
      TEST_TOKEN
    );
    expect("error" in res).toBe(true);
    expect((res as { error: { code: number } }).error.code).toBe(-32_602);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Loopback, not the public hostname: a tool call must stay inside the
  // container rather than going out through DNS and the load balancer.
  it("tools/call re-enters this service on loopback with Bearer + X-Origin: mcp", async () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const apiResponse = { items: [], nextCursor: null };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(apiResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await service.handle(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "graph_nodes_list", arguments: { orgId } },
      },
      TEST_TOKEN
    );

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    const calledInit = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(calledUrl).toBe(
      `http://127.0.0.1:${TEST_PORT}/graph/nodes?orgId=${orgId}`
    );
    expect(calledInit.method).toBe("GET");
    const headers = calledInit.headers as Record<string, string>;
    // The caller's own token: the MCP endpoint and the route it calls are the
    // same resource server with the same audience, so this is not passthrough.
    expect(headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
    expect(headers["X-Origin"]).toBe("mcp");

    expect("result" in res).toBe(true);
    const result = (
      res as { result: { content: { type: string; text: string }[] } }
    ).result;
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(JSON.parse(result.content[0]!.text)).toEqual(apiResponse);
  });

  it("tools/call surfaces a non-2xx route response as a tool execution error", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("server exploded", { status: 502 })
    );

    const res = await service.handle(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "graph_nodes_list",
          arguments: { orgId: "00000000-0000-0000-0000-000000000001" },
        },
      },
      TEST_TOKEN
    );

    expect("error" in res).toBe(true);
    const { error } = res as { error: { code: number; message: string } };
    expect(error.code).toBe(-32_000);
    expect(error.message).toContain("502");
  });
});

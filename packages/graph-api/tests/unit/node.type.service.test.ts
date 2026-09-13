import type {
  GraphNodeListResponse,
  GraphNodeResponse,
  ProjectGraphNodeListInput,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";

import { GraphNodeErrors } from "../../src/modules/nodes/graph.node.errors";
import type { GraphNodeService } from "../../src/modules/nodes/graph.node.service";
import { GraphNodeTypeService } from "../../src/modules/nodes/graph.node.type.service";

/**
 * The base every type facade (`ObjectService`, `RuleService`) is.
 *
 * Two behaviours, and they are the whole reason those packages exist: the type
 * narrowing a caller cannot widen, and the translation that keeps
 * `GRAPH_NODE_NOT_FOUND` off a facade's wire. A stubbed store is right here —
 * what is under test is the argument passed down and the error let back up, so a
 * real database would only add a database to a test about a function call.
 */

const NOT_FOUND = {
  code: "WIDGET_NOT_FOUND",
  status: 404,
  name: "Widget not found",
  description: "No widget matches the supplied id.",
} as const;

const SCOPE = {
  groupId: "11111111-0000-4000-8000-000000000001",
  orgId: "22222222-0000-4000-8000-000000000001",
  projectId: "33333333-0000-4000-8000-000000000001",
} as ResolvedScope;

function node(overrides: Partial<GraphNodeResponse> = {}): GraphNodeResponse {
  return {
    id: "44444444-0000-4000-8000-000000000001",
    type: "widget",
    class: "widget.small",
    name: "Widget",
    ...overrides,
  } as GraphNodeResponse;
}

class WidgetService extends GraphNodeTypeService {
  protected readonly nodeType = "widget";
  protected readonly notFound = NOT_FOUND;
}

/** Records what the facade passed down; answers whatever the test set. */
function build(
  answers: {
    authorize?: () => Promise<ResolvedScope>;
    findById?: () => Promise<GraphNodeResponse>;
    list?: () => Promise<GraphNodeListResponse>;
  } = {}
): {
  calls: { authorize: unknown[][]; findById: unknown[][]; list: unknown[][] };
  service: WidgetService;
} {
  const calls: {
    authorize: unknown[][];
    findById: unknown[][];
    list: unknown[][];
  } = { authorize: [], findById: [], list: [] };

  const nodes = {
    list(...args: unknown[]) {
      calls.list.push(args);
      return (
        answers.list?.() ??
        Promise.resolve({
          items: [],
          nextCursor: null,
        } as GraphNodeListResponse)
      );
    },
    findById(...args: unknown[]) {
      calls.findById.push(args);
      return answers.findById?.() ?? Promise.resolve(node());
    },
    authorizeById(...args: unknown[]) {
      calls.authorize.push(args);
      return answers.authorize?.() ?? Promise.resolve(SCOPE);
    },
  } as unknown as GraphNodeService;

  return { calls, service: new WidgetService(nodes) };
}

describe("GraphNodeTypeService.list", () => {
  it("narrows to its own type before the query runs", async () => {
    const { calls, service } = build();

    await service.list(SCOPE, { limit: 10 } as ProjectGraphNodeListInput, [
      "group-a",
    ]);

    expect(calls.list[0]?.[1]).toMatchObject({ limit: 10, type: "widget" });
  });

  it("refuses to be widened by a caller-supplied type", async () => {
    const { calls, service } = build();

    await service.list(
      SCOPE,
      { type: "rule" } as unknown as ProjectGraphNodeListInput,
      []
    );

    expect(calls.list[0]?.[1]).toMatchObject({ type: "widget" });
  });

  it("passes the scope and the readable groups through untouched", async () => {
    const { calls, service } = build();

    await service.list(SCOPE, {} as ProjectGraphNodeListInput, ["a", "b"]);

    expect(calls.list[0]?.[0]).toBe(SCOPE);
    expect(calls.list[0]?.[2]).toEqual(["a", "b"]);
  });
});

describe("GraphNodeTypeService.findById", () => {
  it("returns a row of its own type, projection and all", async () => {
    const { calls, service } = build();

    const found = await service.findById(SCOPE, "node-1", ["envelope"]);

    expect(found.type).toBe("widget");
    expect(calls.findById[0]).toEqual([SCOPE, "node-1", ["envelope"]]);
  });

  it("answers its own miss for a node of another type", async () => {
    const { service } = build({
      findById: () => Promise.resolve(node({ type: "rule" })),
    });

    await expect(service.findById(SCOPE, "node-1")).rejects.toMatchObject({
      code: "WIDGET_NOT_FOUND",
    });
  });

  it("translates the store's miss rather than describing the store", async () => {
    const { service } = build({
      findById: () =>
        Promise.reject(new PlatformError(GraphNodeErrors.NOT_FOUND)),
    });

    await expect(service.findById(SCOPE, "node-1")).rejects.toMatchObject({
      code: "WIDGET_NOT_FOUND",
    });
  });

  it("lets every other failure through unchanged", async () => {
    const boom = new Error("connection reset");
    const { service } = build({ findById: () => Promise.reject(boom) });

    await expect(service.findById(SCOPE, "node-1")).rejects.toBe(boom);
  });
});

describe("GraphNodeTypeService.authorize", () => {
  it("runs the permit against the row's own group", async () => {
    const { calls, service } = build();

    const scope = await service.authorize(
      { subject: "user-1" } as never,
      "node-1",
      "read"
    );

    expect(scope).toBe(SCOPE);
    expect(calls.authorize[0]).toEqual([
      { subject: "user-1" },
      "node-1",
      "read",
    ]);
  });

  it("translates the permit read's miss too, so no path names graph_node", async () => {
    const { service } = build({
      authorize: () =>
        Promise.reject(new PlatformError(GraphNodeErrors.NOT_FOUND)),
    });

    await expect(
      service.authorize({ subject: "user-1" } as never, "node-1", "read")
    ).rejects.toMatchObject({ code: "WIDGET_NOT_FOUND" });
  });

  it("lets a refusal that is not a miss through unchanged", async () => {
    const forbidden = new Error("forbidden");
    const { service } = build({ authorize: () => Promise.reject(forbidden) });

    await expect(
      service.authorize({ subject: "user-1" } as never, "node-1", "read")
    ).rejects.toBe(forbidden);
  });
});

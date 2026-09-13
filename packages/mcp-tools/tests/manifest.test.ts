import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ALL_TOOLS,
  buildToolsListPayload,
  defineTool,
  describeFilterSpec,
  descriptorToManifestEntry,
  graphNodesListTool,
} from "../src";

describe("ToolDescriptor + manifest", () => {
  it("ALL_TOOLS contains the first-party tool list", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        // audit. One collection, addressed by `orgId` xor `projectId`.
        "audit_events_list",
        "audit_events_get",
        // files. One tool per operation with the scope as a parameter, the
        // way the routes take it; the by-id family stays flat.
        "files_list",
        "files_get",
        "files_download",
        "files_folders_create",
        "files_update",
        // graph. The data plane takes its scope as a parameter, so one tool
        // per operation rather than one per scope.
        "graph_apply",
        "graph_nodes_list",
        "graph_nodes_get",
        "graph_edges_list",
        "graph_edges_get",
        "graph_query",
        "graph_health",
        // orgs. Membership is not here: who is in an organization is a
        // standing on its group, so it belongs to the groups domain.
        "orgs_list",
        "orgs_get",
        // projects
        "projects_list",
        "projects_get",
        "projects_create",
        "projects_update",
        // users
        "me_get",
        "me_update",
      ])
    );
  });

  it("ALL_TOOLS composes per-domain tool lists in a stable order", () => {
    // Domains compose alphabetically: audit, files, graph, orgs, projects,
    // threads, users. Snapshot ordering so a reshuffle surfaces in PR review.
    const names = ALL_TOOLS.map((t) => t.name);
    expect(names.indexOf("audit_events_list")).toBeLessThan(
      names.indexOf("files_list")
    );
    expect(names.indexOf("files_list")).toBeLessThan(
      names.indexOf("graph_nodes_list")
    );
    expect(names.indexOf("graph_nodes_list")).toBeLessThan(
      names.indexOf("orgs_list")
    );
    expect(names.indexOf("orgs_list")).toBeLessThan(
      names.indexOf("projects_list")
    );
    expect(names.indexOf("projects_list")).toBeLessThan(
      names.indexOf("me_get")
    );
  });

  it("graphNodesGetTool uses a path template with {nodeId}", () => {
    const desc = ALL_TOOLS.find((t) => t.name === "graph_nodes_get")!;
    expect(desc.endpoint.path).toBe("/graph/nodes/{nodeId}");
  });

  it("every tool name is unique", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("the node list tool points at the one collection", () => {
    expect(graphNodesListTool.resource).toBe("api");
    expect(graphNodesListTool.endpoint).toEqual({
      method: "GET",
      path: "/graph/nodes",
    });
  });

  it("describeFilterSpec renders a compact 'Filters: ... Sortable: ...' line", () => {
    const line = describeFilterSpec({
      type: { type: "column", valueType: "string", ops: ["eq", "in"] },
      name: {
        type: "column",
        valueType: "string",
        ops: ["eq", "startsWith"],
        sortable: true,
      },
    });
    expect(line).toContain("Filters: type (eq, in); name (eq, startsWith).");
    expect(line).toContain("Sortable: name.");
  });

  it("describeFilterSpec returns just the Filters line when no field is sortable", () => {
    const line = describeFilterSpec({
      role: { type: "column", valueType: "string", ops: ["eq"] },
    });
    expect(line).toBe("Filters: role (eq).");
  });

  it("descriptorToManifestEntry appends the auto-generated filter line when filterSpec is set", () => {
    const entry = descriptorToManifestEntry(graphNodesListTool);
    // The base description shouldn't contain a Filters: line because the
    // descriptor author keeps it minimal; the manifest layer appends it.
    expect(graphNodesListTool.description).not.toContain("Filters:");
    expect(entry.description).toContain(graphNodesListTool.description);
    expect(entry.description).toContain("Filters: id (eq, in); type");
    expect(entry.description).toContain("properties (hasKey");
  });

  it("descriptorToManifestEntry leaves description unchanged when no filterSpec is set", () => {
    const tool = defineTool({
      name: "no_filter_tool",
      description: "Just description, no filters.",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      resource: "api",
      endpoint: { method: "GET", path: "/whatever" },
      scopes: ["openid"],
    });
    expect(descriptorToManifestEntry(tool).description).toBe(
      "Just description, no filters."
    );
  });

  it("descriptorToManifestEntry produces JSON Schema for the input", () => {
    const tool = defineTool({
      name: "echo",
      description: "Echo back the input string.",
      inputSchema: z.object({
        text: z.string().describe("The string to echo."),
      }),
      outputSchema: z.object({ text: z.string() }),
      resource: "api",
      endpoint: { method: "GET", path: "/echo" },
      scopes: ["openid"],
    });

    const entry = descriptorToManifestEntry(tool);
    expect(entry.name).toBe("echo");
    expect(entry.description).toContain("Echo");
    // JSON Schema shape from zod-to-json-schema (openApi3 target).
    expect(entry.inputSchema).toMatchObject({
      type: "object",
      properties: {
        text: { type: "string", description: "The string to echo." },
      },
      required: ["text"],
    });
  });

  it("buildToolsListPayload returns one entry per descriptor", () => {
    const payload = buildToolsListPayload(ALL_TOOLS);
    expect(payload.tools).toHaveLength(ALL_TOOLS.length);
    expect(payload.tools.map((t) => t.name)).toEqual(
      ALL_TOOLS.map((t) => t.name)
    );
  });

  /**
   * The shape is composable, so it does not carry the exclusivity refinement;
   * the server refuses a request naming neither scope, and the descriptor's
   * prose says which to name.
   */
  it("a scoped list accepts either scope id", () => {
    expect(
      graphNodesListTool.inputSchema.safeParse({
        orgId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      }).success
    ).toBe(true);
    expect(
      graphNodesListTool.inputSchema.safeParse({
        projectId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      }).success
    ).toBe(true);
  });
});

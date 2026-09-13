import { describe, expect, it } from "vitest";

import { fillPathTemplate } from "../../../src/mcp/mcp.service";

describe("fillPathTemplate", () => {
  it("returns the static path unchanged when no placeholders", () => {
    const { path, remaining } = fillPathTemplate("/graph/nodes", {
      orgId: "00000000-0000-0000-0000-000000000001",
    });
    expect(path).toBe("/graph/nodes");
    expect(remaining).toEqual({
      orgId: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("substitutes a single {placeholder} + removes the consumed key", () => {
    const { path, remaining } = fillPathTemplate("/graph/nodes/{nodeId}", {
      nodeId: "node-1",
      select: ["envelope"],
    });
    expect(path).toBe("/graph/nodes/node-1");
    expect(remaining).toEqual({ select: ["envelope"] });
  });

  it("substitutes multiple placeholders in path order", () => {
    const { path, remaining } = fillPathTemplate(
      "/orgs/{orgId}/members/{userId}",
      {
        orgId: "org-1",
        userId: "user-2",
        foo: "bar",
      }
    );
    expect(path).toBe("/orgs/org-1/members/user-2");
    expect(remaining).toEqual({ foo: "bar" });
  });

  it("URL-encodes the substituted value", () => {
    const { path } = fillPathTemplate("/orgs/{orgId}", { orgId: "a/b c?d" });
    expect(path).toBe("/orgs/a%2Fb%20c%3Fd");
  });

  it("throws when a required placeholder is missing", () => {
    expect(() => fillPathTemplate("/graph/nodes/{nodeId}", {})).toThrowError(
      /Missing path parameter 'nodeId'/
    );
  });

  it("throws when a required placeholder is null", () => {
    expect(() =>
      fillPathTemplate("/graph/nodes/{nodeId}", { nodeId: null })
    ).toThrowError(/Missing path parameter 'nodeId'/);
  });

  it("does not mutate the caller's args object", () => {
    const args = { nodeId: "n1", extra: "x" };
    fillPathTemplate("/graph/nodes/{nodeId}", args);
    expect(args).toEqual({ nodeId: "n1", extra: "x" });
  });
});

import { describe, expect, it } from "vitest";

import { edgeId, nodeId, scopeKeyOf } from "../src/core/id";

const PROJECT = {
  type: "project",
  projectId: "11111111-1111-4111-8111-111111111111",
} as const;
const ORG = {
  type: "org",
  orgId: "22222222-2222-4222-8222-222222222222",
} as const;

describe("derived ids", () => {
  it("is the same for the same input, which is what makes upserts idempotent", () => {
    const key = scopeKeyOf(PROJECT);
    expect(nodeId(key, "ifc4", "guid-1")).toBe(nodeId(key, "ifc4", "guid-1"));
  });

  it("separates the same source id across formats", () => {
    const key = scopeKeyOf(PROJECT);
    expect(nodeId(key, "ifc4", "shared")).not.toBe(
      nodeId(key, "rvt", "shared")
    );
  });

  it("separates the same source id across scopes, so tenants cannot collide", () => {
    expect(nodeId(scopeKeyOf(PROJECT), "ifc4", "guid-1")).not.toBe(
      nodeId(scopeKeyOf(ORG), "ifc4", "guid-1")
    );
  });

  it("reads the owning id off either scope shape", () => {
    expect(scopeKeyOf(PROJECT)).toBe(PROJECT.projectId);
    expect(scopeKeyOf(ORG)).toBe(ORG.orgId);
  });

  it("gives an edge a direction: a to b is not b to a", () => {
    const key = scopeKeyOf(PROJECT);
    expect(edgeId(key, "ifc4", "contains", "a", "b")).not.toBe(
      edgeId(key, "ifc4", "contains", "b", "a")
    );
  });

  it("separates edge types between the same endpoints", () => {
    const key = scopeKeyOf(PROJECT);
    expect(edgeId(key, "ifc4", "contains", "a", "b")).not.toBe(
      edgeId(key, "ifc4", "bounds", "a", "b")
    );
  });

  it("produces a uuid the database can hold", () => {
    expect(nodeId(scopeKeyOf(PROJECT), "ifc4", "guid-1")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});

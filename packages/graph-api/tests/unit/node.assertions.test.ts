import { PlatformError } from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";
import { assertClassRootStable } from "../../src/modules/nodes/graph.node.assertions";

describe("assertClassRootStable", () => {
  it("allows refining a leaf within the same root", () => {
    expect(() =>
      assertClassRootStable("space", "space.circulation")
    ).not.toThrow();
    expect(() =>
      assertClassRootStable("space.office", "space.treatment")
    ).not.toThrow();
    expect(() =>
      assertClassRootStable("element.wall", "element.wall.curtain")
    ).not.toThrow();
  });

  it("allows an unchanged class", () => {
    expect(() => assertClassRootStable("space", "space")).not.toThrow();
  });

  it("ignores an update that omits class", () => {
    expect(() => assertClassRootStable("space", undefined)).not.toThrow();
  });

  it("rejects re-rooting, which would move the node's derived type", () => {
    expect(() => assertClassRootStable("space", "element.wall")).toThrow(
      PlatformError
    );
    expect(() => assertClassRootStable("space.office", "element.door")).toThrow(
      PlatformError
    );
    // rule and source roots resolve to their own node types, so the same rule
    // stops a rule node from becoming an object
    expect(() =>
      assertClassRootStable("rule.code.clearHeight", "space")
    ).toThrow(PlatformError);
  });

  it("reports the dedicated error code", () => {
    try {
      assertClassRootStable("space", "element.wall");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as PlatformError).code).toBe(
        "GRAPH_NODE_CLASS_ROOT_IMMUTABLE"
      );
      expect((err as PlatformError).statusCode).toBe(409);
    }
  });

  it("treats a bare root and a dotted class with the same root as one root", () => {
    // the root is the first dot-segment, so depth beyond it is irrelevant
    expect(() =>
      assertClassRootStable("space.a.b.c", "space.x.y.z")
    ).not.toThrow();
  });
});

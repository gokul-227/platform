import { describe, expect, it } from "vitest";

import {
  type WorkingEdge,
  WorkingGraph,
  type WorkingNode,
} from "../src/core/graph.working";

const node = (id: string, cls: string): WorkingNode => ({
  id,
  class: cls,
  name: id,
  properties: {},
  type: "object",
});
const edge = (from: string, to: string, type: string): WorkingEdge => ({
  sourceId: from,
  targetId: to,
  type,
});

function sample(): WorkingGraph {
  return new WorkingGraph(
    [
      node("b", "building"),
      node("s1", "storey"),
      node("s2", "storey"),
      node("r1", "space.residential"),
      node("w1", "element.wall"),
    ],
    [
      edge("b", "s1", "contains"),
      edge("b", "s2", "contains"),
      edge("s1", "r1", "contains"),
      edge("s1", "w1", "contains"),
      edge("w1", "r1", "bounds"),
    ]
  );
}

describe("class lookup", () => {
  it("matches a family and its dot-scoped leaves", () => {
    const graph = sample();
    expect(graph.nodesInFamily("space").map((n) => n.id)).toEqual(["r1"]);
    expect(graph.nodesInFamily("storey")).toHaveLength(2);
  });

  it("does not match a class that merely shares a prefix", () => {
    const graph = new WorkingGraph([node("x", "spacer")], []);
    expect(graph.nodesInFamily("space")).toHaveLength(0);
  });

  it("exact lookup ignores descendants", () => {
    expect(sample().nodesOfClass("space")).toHaveLength(0);
    expect(sample().nodesOfClass("space.residential")).toHaveLength(1);
  });
});

describe("adjacency", () => {
  it("reads edges by endpoint and by type", () => {
    const graph = sample();
    expect(graph.edgesFrom("s1")).toHaveLength(2);
    expect(graph.edgesFrom("s1", "contains")).toHaveLength(2);
    expect(graph.edgesFrom("w1", "bounds")).toHaveLength(1);
    expect(graph.edgesTo("r1", "bounds")).toHaveLength(1);
  });

  it("walks descendants breadth-first along one type only", () => {
    const graph = sample();
    const reached = graph.descendants("b", "contains").map((n) => n.id);
    expect(reached).toContain("s1");
    expect(reached).toContain("r1");
    // `bounds` is a different type and must not be followed.
    expect(graph.descendants("w1", "contains")).toHaveLength(0);
  });

  it("indexes a derived edge immediately, so a later pass sees it", () => {
    const graph = sample();
    expect(graph.edgesFrom("r1", "adjacentTo")).toHaveLength(0);
    graph.addEdge(edge("r1", "s2", "adjacentTo"));
    expect(graph.edgesFrom("r1", "adjacentTo")).toHaveLength(1);
    expect(graph.derivedEdges()).toHaveLength(1);
  });
});

describe("patch", () => {
  it("deep-merges without dropping sibling keys", () => {
    const graph = sample();
    graph.patch("r1", { envelope: { areaNet: 20 } });
    graph.patch("r1", { envelope: { height: 3 } });
    expect(graph.node("r1")?.properties.envelope).toEqual({
      areaNet: 20,
      height: 3,
    });
  });

  it("overwrites a scalar rather than merging into it", () => {
    const graph = sample();
    graph.patch("r1", { envelope: { areaNet: 20 } });
    graph.patch("r1", { envelope: { areaNet: 21 } });
    expect(graph.node("r1")?.properties.envelope).toEqual({ areaNet: 21 });
  });

  it("counts only patches that landed on a real node", () => {
    const graph = sample();
    graph.patch("r1", { envelope: { areaNet: 20 } });
    graph.patch("nope", { envelope: { areaNet: 20 } });
    expect(graph.patchCount).toBe(1);
  });

  it("mutates the node the changeset will serialise, with no copy", () => {
    const nodes = [node("r1", "space")];
    const graph = new WorkingGraph(nodes, []);
    graph.patch("r1", { envelope: { areaNet: 20 } });
    expect(nodes[0]?.properties.envelope).toEqual({ areaNet: 20 });
  });
});

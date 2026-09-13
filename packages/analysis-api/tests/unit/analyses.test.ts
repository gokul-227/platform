import { describe, expect, it } from "vitest";
import { AnalysisAdjacencyService } from "../../src/modules/adjacency/analysis.adjacency.service";
import { AnalysisChokepointsService } from "../../src/modules/chokepoints/analysis.chokepoints.service";
import { AnalysisContainmentService } from "../../src/modules/containment/analysis.containment.service";
import { AnalysisEgressService } from "../../src/modules/egress/analysis.egress.service";
import { AnalysisQuantityService } from "../../src/modules/quantity/analysis.quantity.service";
import type { Row } from "../../src/modules/query/sql.cell";
import { AnalysisRatioService } from "../../src/modules/ratio/analysis.ratio.service";

const SCOPE = { projectId: "p", readableGroups: ["g"] };

/**
 * Answers each statement by a fragment of its text, with `*` as the fallback.
 * Several queries in one service end with the same clause, so the ones that
 * differ are keyed and the plain one is whatever is left.
 */
function fakeCypher(byFragment: Record<string, Row[]>) {
  const entries = Object.entries(byFragment).filter(([f]) => f !== "*");
  const fallback = byFragment["*"] ?? [];
  return {
    isAvailable: true,
    run: (_scope: unknown, statement: { cypher: string }) => {
      const hit = entries.find(([fragment]) =>
        statement.cypher.includes(fragment)
      );
      return Promise.resolve(hit ? hit[1] : fallback);
    },
  } as never;
}

function fakeSql(scalars: (number | null)[], grouped: Row[] = []) {
  const queue = [...scalars];
  return {
    grouped: () => Promise.resolve(grouped),
    rows: () => Promise.resolve([]),
    scalar: () => Promise.resolve(queue.shift() ?? null),
  } as never;
}

describe("quantity", () => {
  it("answers with a number when the spec has no grouping", async () => {
    const service = new AnalysisQuantityService(fakeSql([42]));
    expect(
      await service.analyse(SCOPE, {
        aggregate: { method: "count" },
        select: {},
      })
    ).toEqual({ grouped: false, value: 42 });
  });

  it("answers with rows when it does", async () => {
    const service = new AnalysisQuantityService(
      fakeSql([], [{ group: "L1", value: 12 }] as never)
    );
    const answer = await service.analyse(SCOPE, {
      aggregate: { method: "count" },
      groupBy: { by: "field", field: "class" },
      select: {},
    });
    expect(answer).toEqual({
      grouped: true,
      groups: [{ group: "L1", value: 12 }],
    });
  });
});

describe("ratio", () => {
  it("divides, and carries both operands", async () => {
    const service = new AnalysisRatioService(fakeSql([30, 120]));
    expect(
      await service.analyse(SCOPE, {
        denominator: { aggregate: { method: "count" }, select: {} },
        isPercent: false,
        numerator: { aggregate: { method: "count" }, select: {} },
      })
    ).toEqual({ denominator: 120, numerator: 30, value: 0.25 });
  });

  it("refuses to divide by zero rather than answering Infinity", async () => {
    const service = new AnalysisRatioService(fakeSql([30, 0]));
    const answer = await service.analyse(SCOPE, {
      denominator: { aggregate: { method: "count" }, select: {} },
      isPercent: false,
      numerator: { aggregate: { method: "count" }, select: {} },
    });
    // Both operands still come back: a null with a zero denominator is a
    // different finding from a null with no numerator.
    expect(answer).toEqual({ denominator: 0, numerator: 30, value: null });
  });
});

describe("chokepoints", () => {
  //  a — b — c — d      one line: b and c are cut vertices, every edge a bridge
  const line = {
    "bridges.get": [
      { fromId: "a", toId: "b" },
      { fromId: "b", toId: "c" },
      { fromId: "c", toId: "d" },
    ],
    "MATCH (a:Node)-[:`CONNECTS_TO`]-(b:Node)": [
      { fromId: "a", toId: "b" },
      { fromId: "b", toId: "c" },
      { fromId: "c", toId: "d" },
    ],
    "RETURN n.id AS nodeId": [
      { nodeId: "a" },
      { nodeId: "b" },
      { nodeId: "c" },
      { nodeId: "d" },
    ],
  };

  it("counts what each passage carries, not just that it is singular", async () => {
    const service = new AnalysisChokepointsService(fakeCypher(line));
    const answer = await service.analyse(SCOPE, {});

    // The middle passage splits two from two; the end ones strand one each.
    expect(answer.passages.map((p) => p.stranded)).toEqual([2, 1, 1]);
    expect(answer.robust).toBe(false);
    expect(answer.examined).toBe(4);
  });

  it("finds the spaces that cannot be passed around", async () => {
    const service = new AnalysisChokepointsService(fakeCypher(line));
    const answer = await service.analyse(SCOPE, {});

    // Ends of a line are not cut vertices; the two in the middle are.
    expect(answer.spaces.map((s) => s.nodeId).sort()).toEqual(["b", "c"]);
  });

  it("finds nothing in a ring, where every space can be passed around", async () => {
    //  a — b
    //  |   |     no bridges, no cut vertices
    //  d — c
    const ring = [
      { fromId: "a", toId: "b" },
      { fromId: "b", toId: "c" },
      { fromId: "c", toId: "d" },
      { fromId: "d", toId: "a" },
    ];
    const service = new AnalysisChokepointsService(
      fakeCypher({
        "bridges.get": [],
        "MATCH (a:Node)-[:`CONNECTS_TO`]-(b:Node)": ring,
        "RETURN n.id AS nodeId": [
          { nodeId: "a" },
          { nodeId: "b" },
          { nodeId: "c" },
          { nodeId: "d" },
        ],
      })
    );
    const answer = await service.analyse(SCOPE, {});

    expect(answer.passages).toEqual([]);
    expect(answer.spaces).toEqual([]);
    expect(answer.robust).toBe(true);
  });
});

describe("containment", () => {
  it("accepts either expression of a parent", async () => {
    const service = new AnalysisContainmentService(
      fakeCypher({
        CONTAINS: [
          { nodeId: "byEdge", parentIds: ["storey-1"] },
          { nodeId: "byColumn", parentIds: ["storey-1"] },
          { nodeId: "orphan", parentIds: [] },
        ],
      })
    );
    const answer = await service.analyse(SCOPE, { classes: ["space"] });

    expect(answer.orphans).toEqual(["orphan"]);
    expect(answer.sound).toBe(false);
    expect(answer.examined).toBe(3);
  });

  it("reports a node contained twice, which is a tree that is not a tree", async () => {
    const service = new AnalysisContainmentService(
      fakeCypher({
        CONTAINS: [{ nodeId: "shared", parentIds: ["storey-1", "storey-2"] }],
      })
    );
    const answer = await service.analyse(SCOPE, { classes: ["space"] });

    expect(answer.containedTwice).toEqual([
      { nodeId: "shared", parentIds: ["storey-1", "storey-2"] },
    ]);
  });

  it("does not count one parent given both ways as two", async () => {
    const service = new AnalysisContainmentService(
      fakeCypher({
        CONTAINS: [{ nodeId: "both", parentIds: ["storey-1", "storey-1"] }],
      })
    );
    const answer = await service.analyse(SCOPE, { classes: ["space"] });

    expect(answer.sound).toBe(true);
  });
});

describe("adjacency", () => {
  const pairs = {
    ADJACENT_TO: [
      { aId: "1", aUse: "office", bId: "2", bUse: "office" },
      { aId: "3", aUse: "office", bId: "4", bUse: "plant" },
      { aId: "5", aUse: null, bId: "6", bUse: "plant" },
    ],
    "count(n) AS examined": [{ examined: 6 }],
  };

  it("returns every pair by default", async () => {
    const service = new AnalysisAdjacencyService(fakeCypher(pairs));
    const answer = await service.analyse(SCOPE, { differingUseOnly: false });
    expect(answer.pairs).toHaveLength(3);
    expect(answer.examined).toBe(6);
  });

  it("treats an unknown use as unknown, not as differing", async () => {
    const service = new AnalysisAdjacencyService(fakeCypher(pairs));
    const answer = await service.analyse(SCOPE, { differingUseOnly: true });

    // Only the office/plant pair. The null/plant pair is not evidence of a
    // separation problem, and reporting it would be inventing one.
    expect(answer.pairs.map((p) => p.aId)).toEqual(["3"]);
  });
});

describe("egress", () => {
  const spaces = [{ nodeId: "a" }, { nodeId: "b" }, { nodeId: "exit" }];

  it("scores nothing when no space is marked as a way out", async () => {
    const service = new AnalysisEgressService(
      fakeCypher({
        "n.programme.egressRole": [],
        "*": spaces,
      })
    );
    const answer = await service.analyse(SCOPE, {});

    // Every space unreachable rather than every space passing: a gap is not
    // compliance, and a building nobody described is not a compliant one.
    expect(answer.exits).toBe(0);
    expect(answer.unreachable).toEqual(["a", "b", "exit"]);
    expect(answer.overLimit).toEqual([]);
  });

  it("reports a space with no path as unreachable, not as distance zero", async () => {
    const service = new AnalysisEgressService(
      fakeCypher({
        "n.programme.egressRole": [{ nodeId: "exit" }],
        "*": spaces,
        "best.exit AS exitId": [
          { exitId: "exit", inMetres: true, nodeId: "a", value: 12 },
        ],
      })
    );
    const answer = await service.analyse(SCOPE, {});

    expect(answer.unreachable).toEqual(["b"]);
    expect(answer.furthest).toEqual([
      { exitId: "exit", nodeId: "a", value: 12 },
    ]);
  });

  it("will not settle a metric limit with a hop count", async () => {
    const service = new AnalysisEgressService(
      fakeCypher({
        "n.programme.egressRole": [{ nodeId: "exit" }],
        "*": spaces,
        "best.exit AS exitId": [
          { exitId: "exit", inMetres: false, nodeId: "a", value: 99 },
        ],
      })
    );
    const answer = await service.analyse(SCOPE, { maxDistance: 35 });

    expect(answer.measuredIn).toBe("hops");
    // 99 hops is not 99 metres, so it is not over a 35 m limit.
    expect(answer.overLimit).toEqual([]);
  });

  it("applies the limit once the distances are in metres", async () => {
    const service = new AnalysisEgressService(
      fakeCypher({
        "n.programme.egressRole": [{ nodeId: "exit" }],
        "*": spaces,
        "best.exit AS exitId": [
          { exitId: "exit", inMetres: true, nodeId: "a", value: 41 },
          { exitId: "exit", inMetres: true, nodeId: "b", value: 12 },
        ],
      })
    );
    const answer = await service.analyse(SCOPE, { maxDistance: 35 });

    expect(answer.measuredIn).toBe("metres");
    expect(answer.overLimit.map((entry) => entry.nodeId)).toEqual(["a"]);
  });
});

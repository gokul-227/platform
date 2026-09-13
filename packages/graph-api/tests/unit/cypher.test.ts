import type { GraphVersionRow } from "@aec-craft/platform-graph-api/nest";
import { describe, expect, it } from "vitest";
import {
  blockProperties,
  labelFor,
  relTypeFor,
  toCypherStatements,
} from "../../src/modules/sync/cypher";

const ORG_ID = "0c5a6c1e-1111-4abc-8def-aaaaaaaaaaaa";
const PROJECT_ID = "1d6b7d2f-2222-4abc-8def-bbbbbbbbbbbb";
const NODE_ID = "2e7c8e30-3333-4abc-8def-cccccccccccc";
const PARENT_ID = "3f8d9f41-4444-4abc-8def-dddddddddddd";
const EDGE_ID = "4a9eaf52-5555-4abc-8def-eeeeeeeeeeee";
const SOURCE_ID = "5bafbf63-6666-4abc-8def-ffffffffffff";
const TARGET_ID = "6cb0cf74-7777-4abc-8def-000000000000";

const ORG_LABEL = `Org_${ORG_ID.replaceAll("-", "_")}`;
const PROJECT_LABEL = `Project_${PROJECT_ID.replaceAll("-", "_")}`;

function nodeRow(overrides: Partial<GraphVersionRow> = {}): GraphVersionRow {
  return {
    seq: 1,
    entityType: "node",
    entityId: NODE_ID,
    op: "created",
    version: "1",
    orgId: ORG_ID,
    projectId: PROJECT_ID,
    actorId: null,
    contentHash: "a".repeat(64),
    snapshot: {
      id: NODE_ID,
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      type: "object",
      class: "space.room",
      name: "Room 1.01",
      version: "1",
      parentId: null,
      phase: "design",
      properties: { envelope: { netArea: 5.8, height: 2.45 } },
    },
    createdAt: new Date(),
    syncedAt: null,
    ...overrides,
  };
}

function edgeRow(overrides: Partial<GraphVersionRow> = {}): GraphVersionRow {
  return {
    seq: 2,
    entityType: "edge",
    entityId: EDGE_ID,
    op: "created",
    version: "1",
    orgId: ORG_ID,
    projectId: PROJECT_ID,
    actorId: null,
    contentHash: "b".repeat(64),
    snapshot: {
      id: EDGE_ID,
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      targetId: TARGET_ID,
      type: "serves",
      version: "1",
      properties: { length: 3.2, passable: true },
    },
    createdAt: new Date(),
    syncedAt: null,
    ...overrides,
  };
}

describe("toCypherStatements / node upsert", () => {
  it("MERGEs on id, sets core props + block map properties", () => {
    const [merge] = toCypherStatements(nodeRow());
    expect(merge).toBeDefined();
    expect(merge?.text).toContain("MERGE (n:Node {id: $id})");
    expect(merge?.text).toContain("SET n = $props");
    expect(merge?.params.id).toBe(NODE_ID);

    const props = merge?.params.props as Record<string, unknown>;
    expect(props).toMatchObject({
      id: NODE_ID,
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      type: "object",
      class: "space.room",
      name: "Room 1.01",
      version: "1",
      phase: "design",
      envelope: { netArea: 5.8, height: 2.45 },
    });
    // The bag itself never nests under a `properties` key on the wire.
    expect(props.properties).toBeUndefined();
  });

  it("sets type, class-root, org and project labels (dashes -> underscores)", () => {
    const [merge] = toCypherStatements(nodeRow());
    expect(merge?.text).toContain(
      `SET n:\`Object\`:\`Space\`:\`${ORG_LABEL}\`:\`${PROJECT_LABEL}\``
    );
  });

  it("REMOVEs the class-root label set before re-adding", () => {
    const [merge] = toCypherStatements(nodeRow());
    expect(merge?.text).toContain(
      "REMOVE n:Site:Building:Storey:Space:Element:Interface:Rule:Source"
    );
  });

  it("without parentId: only the delete-old-parent-rel statement follows", () => {
    const statements = toCypherStatements(nodeRow());
    expect(statements).toHaveLength(2);
    // untyped: the arc to remove may be from either containment tree
    expect(statements[1]?.text).toContain(
      "MATCH (p)-[r {fromParentId: true}]->(n:Node {id: $id}) DELETE r"
    );
    expect(statements[1]?.params).toEqual({ id: NODE_ID });
  });

  it("with parentId: delete-old-parent-rel plus MERGE of the parent stub + CONTAINS", () => {
    const row = nodeRow({
      snapshot: { ...nodeRow().snapshot!, parentId: PARENT_ID },
    });
    const statements = toCypherStatements(row);
    expect(statements).toHaveLength(3);
    expect(statements[1]?.text).toContain("DELETE r");
    expect(statements[2]?.text).toContain("MERGE (p:Node {id: $parentId})");
    expect(statements[2]?.text).toContain(
      "MERGE (p)-[:`CONTAINS` {fromParentId: true}]->(n)"
    );
    expect(statements[2]?.params).toEqual({ id: NODE_ID, parentId: PARENT_ID });
  });

  it("mirrors a source's parentId as INCLUDES, not CONTAINS", () => {
    const row = nodeRow({
      snapshot: {
        ...nodeRow().snapshot!,
        type: "source",
        class: "source.law.lbo_bw",
        parentId: PARENT_ID,
      },
    });
    const statements = toCypherStatements(row);
    expect(statements[2]?.text).toContain(
      "MERGE (p)-[:`INCLUDES` {fromParentId: true}]->(n)"
    );
  });

  it("falls back to CONTAINS for a root that belongs to no tree", () => {
    const row = nodeRow({
      snapshot: {
        ...nodeRow().snapshot!,
        type: "rule",
        class: "rule.code.clearHeight",
        parentId: PARENT_ID,
      },
    });
    const statements = toCypherStatements(row);
    expect(statements[2]?.text).toContain(
      "MERGE (p)-[:`CONTAINS` {fromParentId: true}]->(n)"
    );
  });

  it("throws on a corrupt upsert row with NULL snapshot", () => {
    expect(() =>
      toCypherStatements(nodeRow({ snapshot: null, contentHash: null }))
    ).toThrow(/no snapshot/);
    expect(() =>
      toCypherStatements(nodeRow({ op: "updated", snapshot: null }))
    ).toThrow(/no snapshot/);
  });
});

describe("toCypherStatements / node delete", () => {
  it("emits a single DETACH DELETE", () => {
    const statements = toCypherStatements(
      nodeRow({ op: "deleted", snapshot: null, contentHash: null })
    );
    expect(statements).toHaveLength(1);
    expect(statements[0]?.text).toBe(
      "MATCH (n:Node {id: $id}) DETACH DELETE n"
    );
    expect(statements[0]?.params).toEqual({ id: NODE_ID });
  });
});

describe("toCypherStatements / edge upsert", () => {
  it.each([
    "created",
    "updated",
  ] as const)("%s: MERGEs endpoint stubs, deletes by id, then CREATEs the typed relationship", (op) => {
    const statements = toCypherStatements(edgeRow({ op }));
    expect(statements).toHaveLength(4);

    expect(statements[0]?.text).toBe("MERGE (a:Node {id: $sourceId})");
    expect(statements[0]?.params).toEqual({ sourceId: SOURCE_ID });
    expect(statements[1]?.text).toBe("MERGE (b:Node {id: $targetId})");
    expect(statements[1]?.params).toEqual({ targetId: TARGET_ID });

    expect(statements[2]?.text).toContain("WHERE r.id = $id DELETE r");
    expect(statements[2]?.params).toEqual({ id: EDGE_ID });

    expect(statements[3]?.text).toContain("CREATE (a)-[r:`SERVES`]->(b)");
    const props = statements[3]?.params.props as Record<string, unknown>;
    expect(props).toMatchObject({
      id: EDGE_ID,
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      type: "serves",
      version: "1",
      length: 3.2,
      passable: true,
    });
  });

  it("throws on a corrupt upsert row with NULL snapshot", () => {
    expect(() => toCypherStatements(edgeRow({ snapshot: null }))).toThrow(
      /no snapshot/
    );
  });
});

describe("toCypherStatements / edge delete", () => {
  it("emits a single delete-by-id", () => {
    const statements = toCypherStatements(
      edgeRow({ op: "deleted", snapshot: null, contentHash: null })
    );
    expect(statements).toHaveLength(1);
    expect(statements[0]?.text).toBe(
      "MATCH (x)-[r]->(y) WHERE r.id = $id DELETE r"
    );
    expect(statements[0]?.params).toEqual({ id: EDGE_ID });
  });
});

describe("labelFor", () => {
  it("uppercases the first character", () => {
    expect(labelFor("object")).toBe("Object");
    expect(labelFor("rule")).toBe("Rule");
  });

  it("strips anything outside [A-Za-z0-9_]", () => {
    expect(labelFor("weird type!")).toBe("Weirdtype");
    expect(labelFor("space-room")).toBe("Spaceroom");
  });

  it("returns '' for empty / fully-stripped input", () => {
    expect(labelFor("")).toBe("");
    expect(labelFor("!!!")).toBe("");
  });
});

describe("relTypeFor", () => {
  it("converts camelCase to SCREAMING_SNAKE", () => {
    expect(relTypeFor("serves")).toBe("SERVES");
    expect(relTypeFor("adjacentTo")).toBe("ADJACENT_TO");
    expect(relTypeFor("contains")).toBe("CONTAINS");
  });

  it("sanitizes exotic characters to single underscores", () => {
    expect(relTypeFor("weird type!")).toBe("WEIRD_TYPE");
  });

  it("falls back to RELATES_TO for empty input", () => {
    expect(relTypeFor("")).toBe("RELATES_TO");
    expect(relTypeFor("!!!")).toBe("RELATES_TO");
  });
});

describe("blockProperties", () => {
  it("keeps capability blocks as nested maps", () => {
    expect(
      blockProperties({ envelope: { netArea: 5.8, height: 2.45 } })
    ).toEqual({
      envelope: { netArea: 5.8, height: 2.45 },
    });
  });

  it("keeps top-level scalars as-is", () => {
    expect(blockProperties({ count: 3, passable: true })).toEqual({
      count: 3,
      passable: true,
    });
  });

  it("skips keys that collide with the reserved top-level scalars", () => {
    expect(
      blockProperties({ class: "evil", name: "evil", envelope: { d: 1 } })
    ).toEqual({ envelope: { d: 1 } });
  });

  it("drops null and undefined leaves inside blocks", () => {
    expect(
      blockProperties({ a: null, b: undefined, nested: { c: null, d: 1 } })
    ).toEqual({
      nested: { d: 1 },
    });
  });

  it("drops blocks that sanitize to empty (honest keys(n) inventory)", () => {
    expect(blockProperties({ envelope: {}, systems: { x: null } })).toEqual({});
  });

  it("keeps arrays of scalars", () => {
    expect(
      blockProperties({ tags: ["a", "b"], mixed: [1, "two", true] })
    ).toEqual({
      tags: ["a", "b"],
      mixed: [1, "two", true],
    });
  });

  it("keeps arrays of maps and nested arrays (footprint rings)", () => {
    expect(blockProperties({ points: [{ x: 1 }, { x: 2 }], ok: 1 })).toEqual({
      points: [{ x: 1 }, { x: 2 }],
      ok: 1,
    });
    expect(blockProperties({ nested: [[1, 2]] })).toEqual({ nested: [[1, 2]] });
    expect(
      blockProperties({
        geometry: {
          footprint: {
            rings: [
              [
                { x: 0, z: 0 },
                { x: 1, z: 0 },
                { x: 1, z: 1 },
              ],
            ],
            source: "mesh",
          },
        },
      })
    ).toEqual({
      geometry: {
        footprint: {
          rings: [
            [
              { x: 0, z: 0 },
              { x: 1, z: 0 },
              { x: 1, z: 1 },
            ],
          ],
          source: "mesh",
        },
      },
    });
  });

  it("drops array elements that sanitize to nothing", () => {
    expect(blockProperties({ list: [null, { x: null }, 1] })).toEqual({
      list: [1],
    });
    expect(blockProperties({ list: [null] })).toEqual({});
  });

  it("drops values nested deeper than 6 levels", () => {
    // A leaf under six wrappers survives (its values sit at depth 6).
    const six = { a1: { a2: { a3: { a4: { a5: { a6: { leaf: 1 } } } } } } };
    expect(blockProperties(six)).toEqual(six);

    // One wrapper more and the leaf is dropped; the empty chain collapses.
    const seven = {
      a1: { a2: { a3: { a4: { a5: { a6: { a7: { leaf: 1 } } } } } } },
    };
    expect(blockProperties(seven)).toEqual({});
  });

  it("returns an empty bag for an empty input", () => {
    expect(blockProperties({})).toEqual({});
  });
});

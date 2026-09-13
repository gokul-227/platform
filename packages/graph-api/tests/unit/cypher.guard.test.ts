import { describe, expect, it } from "vitest";

import {
  assertEntitiesInScope,
  assertReadOnlyCypher,
  assertScopedCypher,
  mapBoltValue,
  scopedCypher,
} from "../../src/modules/query/cypher.guard";

const SCOPE = { orgId: "org-1", projectId: "proj-1" };

describe("assertReadOnlyCypher", () => {
  it.each([
    "MATCH (n:Node) WHERE n.projectId = $projectId RETURN n",
    "MATCH (a)-[r:ADJACENT_TO]->(b) RETURN a, r, b LIMIT 10",
    "UNWIND $ids AS id MATCH (n {id: id}) RETURN n.name",
  ])("accepts read statement: %s", (query) => {
    expect(() => {
      assertReadOnlyCypher(query);
    }).not.toThrow();
  });

  it.each([
    "CREATE (n:Evil) RETURN n",
    "MATCH (n) DELETE n",
    "MATCH (n) DETACH DELETE n",
    "MATCH (n) SET n.x = 1 RETURN n",
    "MERGE (n:Node {id: 'x'}) RETURN n",
    "MATCH (n) REMOVE n:Label RETURN n",
    "DROP INDEX ON :Node(id)",
    "match (n) set n.sneaky = true return n",
    "LOAD CSV FROM 'file:///x' AS row RETURN row",
  ])("rejects write statement: %s", (query) => {
    expect(() => {
      assertReadOnlyCypher(query);
    }).toThrow(/read-only|not allowed|GRAPH_QUERY/i);
  });
});

describe("mapBoltValue", () => {
  it("passes scalars and arrays through, converts bolt integers", () => {
    const entities: { props: Record<string, unknown> }[] = [];
    expect(mapBoltValue("x", entities)).toBe("x");
    expect(mapBoltValue(1.5, entities)).toBe(1.5);
    expect(mapBoltValue(true, entities)).toBe(true);
    expect(mapBoltValue(null, entities)).toBeNull();
    expect(mapBoltValue([1, "a"], entities)).toEqual([1, "a"]);
    const fakeInt = { toNumber: () => 42, inSafeRange: () => true };
    expect(mapBoltValue(fakeInt, entities)).toBe(42);
  });

  it("maps node-like values to tagged shapes and collects them", () => {
    const entities: { props: Record<string, unknown> }[] = [];
    const node = {
      labels: ["Node", "Space"],
      properties: {
        id: "n1",
        orgId: "org-1",
        projectId: "proj-1",
        name: "Room",
      },
    };
    const mapped = mapBoltValue(node, entities) as Record<string, unknown>;
    expect(mapped.type).toBe("node");
    expect(mapped.labels).toEqual(["Node", "Space"]);
    expect((mapped.properties as Record<string, unknown>).name).toBe("Room");
    expect(entities).toHaveLength(1);
  });

  it("maps relationship-like values and collects them", () => {
    const entities: { props: Record<string, unknown> }[] = [];
    const rel = {
      type: "ADJACENT_TO",
      properties: { id: "e1", orgId: "org-1", length: 8 },
    };
    const mapped = mapBoltValue(rel, entities) as Record<string, unknown>;
    expect(mapped.type).toBe("relationship");
    // The relationship's own type moved to `edgeType` when the discriminator
    // took `type`: the two used to sit on one object meaning different things.
    expect(mapped.edgeType).toBe("ADJACENT_TO");
    expect(entities).toHaveLength(1);
  });
});

describe("assertEntitiesInScope", () => {
  it("accepts project-scoped and org-library entities", () => {
    expect(() => {
      assertEntitiesInScope(
        [
          { props: { orgId: "org-1", projectId: "proj-1" } },
          { props: { orgId: "org-1", projectId: null } },
          { props: { orgId: "org-1" } }, // projectId absent = org library
        ],
        SCOPE
      );
    }).not.toThrow();
  });

  it.each<[Record<string, unknown>, string]>([
    [{ orgId: "org-2", projectId: "proj-1" }, "wrong org"],
    [{ orgId: "org-1", projectId: "proj-2" }, "sibling project"],
    [{}, "no scope props (stub)"],
  ])("rejects out-of-scope entity (%j, %s)", (props) => {
    expect(() => {
      assertEntitiesInScope([{ props }], SCOPE);
    }).toThrow();
  });
});

/**
 * The fence, which is the only layer that can stop a leak the post-filter never
 * sees: a statement returning no entity at all.
 *
 * Written as "what does it refuse", because refusing is the whole design — a
 * pattern this cannot read is rejected rather than fenced on a guess.
 */
describe("assertScopedCypher", () => {
  it.each([
    ["a plain scoped match", "MATCH (n:Scoped) RETURN n"],
    ["a second label beside it", "MATCH (s:Storey:Scoped) RETURN s.id AS id"],
    ["an aggregate over scoped rows", "MATCH (n:Scoped) RETURN count(n) AS c"],
    [
      "both ends of a relationship",
      "MATCH (a:Scoped)-[r:CONTAINS]->(b:Scoped) RETURN a, r, b",
    ],
  ])("allows %s", (_label, query) => {
    expect(() => assertScopedCypher(query)).not.toThrow();
  });

  it.each([
    // The leak #186 was filed for: no entity comes back, so the post-filter has
    // nothing to check, and every tenant's rows are counted.
    ["an unlabelled match", "MATCH (n) RETURN count(n) AS c", "UNSCOPED"],
    [
      "the projection's own label",
      "MATCH (n:Node) RETURN count(n)",
      "UNSCOPED",
    ],
    ["an anonymous node", "MATCH (:Scoped)-[r]->() RETURN r", "UNSCOPED"],
    ["one unscoped end", "MATCH (a:Scoped)-[r]->(b) RETURN b", "UNSCOPED"],
    [
      "a partition named by the caller",
      "MATCH (n:Project_abc) RETURN n",
      "SCOPE_RESERVED",
    ],
    [
      "a variable-length hop",
      "MATCH (a:Scoped)-[*1..3]-(b:Scoped) RETURN count(*)",
      "VARIABLE_LENGTH",
    ],
  ])("refuses %s", (_label, query, code) => {
    expect(() => assertScopedCypher(query)).toThrowError(
      expect.objectContaining({
        code: `GRAPH_QUERY_CYPHER_${code}`,
      })
    );
  });
});

describe("scopedCypher", () => {
  it("resolves `:Scoped` to the project's own label", () => {
    const out = scopedCypher("MATCH (n:Scoped) RETURN n", {
      orgId: "org-1",
      projectId: "proj-1",
    });
    expect(out).toBe("MATCH (n:Scope_proj_1) RETURN n");
  });

  it("composes with a label the caller wrote, which a disjunction could not", () => {
    // Memgraph rejects `(s:Storey:A|B)`, so one label is the only form that
    // survives beside another. The cost is the org library, which this endpoint
    // does not show.
    const out = scopedCypher("MATCH (s:Storey:Scoped) RETURN s", {
      orgId: "org-1",
      projectId: "proj-1",
    });
    expect(out).toBe("MATCH (s:Storey:Scope_proj_1) RETURN s");
  });

  it("substitutes every occurrence, not the first", () => {
    const out = scopedCypher("MATCH (a:Scoped)-[r]->(b:Scoped) RETURN a, b", {
      orgId: "o",
      projectId: "p",
    });
    expect(out).not.toContain("Scoped");
  });
});

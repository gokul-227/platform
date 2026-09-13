import type { QuerySpec } from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";
import { createSqlDialect } from "../../src/modules/query/sql.dialect";

const SCOPE = {
  projectId: "22222222-2222-2222-2222-222222222222",
  readableGroups: ["33333333-3333-3333-3333-333333333333"],
};

const sql = createSqlDialect(SCOPE);

describe("the sql dialect", () => {
  it("scopes every aggregate, including the group list", () => {
    const spec: QuerySpec = {
      aggregate: { method: "count" },
      select: { class: { match: "prefix", value: "space" } },
    };
    const { text, params } = sql.compile(spec);

    // Strict to the project: an analysis is about one building, and the org
    // library holds no space or element rows to be missed.
    expect(text).toContain("n.project_id = $1");
    expect(text).toContain("n.group_id = ANY($2::uuid[])");
    expect(params[1]).toEqual(SCOPE.readableGroups);
  });

  it("matches a class root and its refinements, but not a longer word", () => {
    const { text } = sql.compile({
      aggregate: { method: "count" },
      select: { class: { match: "prefix", value: "space" } },
    });
    // The dot is what stops `space` matching `spaceship`.
    expect(text).toContain("OR n.class LIKE $3 || '.%'");
  });

  it("reads a block field out of the jsonb bag and casts it to aggregate", () => {
    const { text } = sql.compile({
      aggregate: { field: "envelope.areaNet", method: "sum" },
      select: { class: { match: "exact", value: "space" } },
    });
    expect(text).toContain(
      "sum(NULLIF((n.properties #>> '{envelope,areaNet}'), '')::numeric)"
    );
  });

  it("reads an identity field from its column, not from the bag", () => {
    const { text } = sql.compile({
      aggregate: { method: "count" },
      select: { where: [{ operator: "eq", path: "name", value: "Flur" }] },
    });
    expect(text).toContain("n.name = $");
    expect(text).not.toContain("properties #>> '{name}'");
  });

  it("keeps a row that is missing the field when the test is 'not equal'", () => {
    const { text } = sql.compile({
      aggregate: { method: "count" },
      select: {
        where: [{ operator: "neq", path: "programme.use", value: "corridor" }],
      },
    });
    // `<> ` on null is null, which would drop exactly the rows the caller asked for.
    expect(text).toContain("IS DISTINCT FROM");
  });

  it("escapes a wildcard in a contains needle", () => {
    const { params } = sql.compile({
      aggregate: { method: "count" },
      select: { where: [{ operator: "contains", path: "name", value: "50%" }] },
    });
    expect(params).toContain("%50\\%%");
  });

  it("scopes the joined edge and the far node when grouping by relation", () => {
    const { text } = sql.compile({
      aggregate: { method: "count" },
      groupBy: {
        by: "relation",
        direction: "in",
        edge: "contains",
        label: "name",
      },
      select: { class: { match: "prefix", value: "space" } },
    });
    expect(text).toContain("JOIN graph_edge e ON e.target_id = n.id");
    expect(text).toContain("JOIN graph_node g ON e.source_id = g.id");
    // A caller who may not read the storey may not group by its name either.
    expect(text).toContain("e.group_id = ANY(");
    expect(text).toContain("g.group_id = ANY(");
    expect(text).toContain("GROUP BY g.name");
  });

  it("refuses a path it cannot reach rather than reading it as a property", () => {
    expect(() =>
      sql.compile({
        aggregate: { method: "count" },
        select: {
          where: [{ operator: "eq", path: "parent.name", value: "1" }],
        },
      })
    ).toThrow(/cannot reach 'parent\.'/);
  });

  it("refuses an operator it has not implemented", () => {
    expect(() =>
      sql.compile({
        aggregate: { method: "count" },
        select: {
          where: [{ operator: "nearlyEquals", path: "name", value: 1 }],
        },
      })
    ).toThrow(/Unsupported operator/);
  });
});

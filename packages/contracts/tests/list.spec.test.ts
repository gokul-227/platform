import { describe, expect, it } from "vitest";

import { column, defineFilters, jsonbPath } from "../src/query/filter.spec";
import { defineListSpec, listInputSchema } from "../src/query/list.spec";

const filters = defineFilters({
  name: column.string({ ops: ["eq", "contains"] }),
  createdAt: column.date({ ops: ["gte", "lt"], sortable: true }),
  context: jsonbPath({ ops: ["eq"] }),
});

const unsortable = defineFilters({
  name: column.string({ ops: ["eq"] }),
});

describe("defineListSpec", () => {
  it("refuses a default mode the endpoint does not serve", () => {
    expect(() =>
      defineListSpec({
        filters,
        pagination: { modes: ["offset"], default: "cursor" },
      })
    ).toThrow(/default mode/);
  });

  it("returns the spec it was given", () => {
    const spec = defineListSpec({
      filters,
      pagination: { modes: ["cursor"], default: "cursor" },
      defaultSort: "createdAt:desc",
    });
    expect(spec.defaultSort).toBe("createdAt:desc");
  });
});

describe("listInputSchema", () => {
  it("carries only the params of the modes the endpoint allows", () => {
    const cursorOnly = listInputSchema(
      defineListSpec({
        filters,
        pagination: { modes: ["cursor"], default: "cursor" },
      })
    );
    expect(Object.keys(cursorOnly.shape).sort()).toEqual([
      "context",
      "createdAt",
      "cursor",
      "limit",
      "name",
    ]);

    const offsetOnly = listInputSchema(
      defineListSpec({
        filters,
        pagination: { modes: ["offset"], default: "offset" },
      })
    );
    expect(Object.keys(offsetOnly.shape)).toContain("sort");
    expect(Object.keys(offsetOnly.shape)).not.toContain("cursor");
  });

  it("omits sort when the spec declares no sortable field", () => {
    const schema = listInputSchema(
      defineListSpec({
        filters: unsortable,
        pagination: { modes: ["offset"], default: "offset" },
      })
    );
    expect(Object.keys(schema.shape)).not.toContain("sort");
  });

  it("coerces the numbers a query string delivers as text", () => {
    const schema = listInputSchema(
      defineListSpec({
        filters,
        pagination: { modes: ["cursor", "offset"], default: "cursor" },
      })
    );
    expect(schema.parse({ limit: "25" })).toMatchObject({ limit: 25 });
    expect(schema.parse({ page: "2", pageSize: "10" })).toMatchObject({
      page: 2,
      pageSize: 10,
    });
  });

  it("bounds a page size, and refuses a zero page", () => {
    const schema = listInputSchema(
      defineListSpec({
        filters,
        pagination: { modes: ["offset"], default: "offset" },
      })
    );
    expect(() => schema.parse({ pageSize: "500" })).toThrow();
    expect(() => schema.parse({ page: "0" })).toThrow();
  });

  it("keeps a filter value as the string the applier parses", () => {
    const schema = listInputSchema(
      defineListSpec({
        filters,
        pagination: { modes: ["cursor"], default: "cursor" },
      })
    );
    // Operator validation and coercion belong to the server-side applier, so
    // the boundary's only question is whether a string arrived.
    expect(schema.parse({ name: "contains.acme" })).toMatchObject({
      name: "contains.acme",
    });
    expect(schema.parse({ name: "nonsense.acme" })).toMatchObject({
      name: "nonsense.acme",
    });
    expect(() => schema.parse({ name: 42 })).toThrow();
  });

  it("drops a param the spec never declared", () => {
    const schema = listInputSchema(
      defineListSpec({
        filters: unsortable,
        pagination: { modes: ["cursor"], default: "cursor" },
      })
    );
    expect(schema.parse({ name: "eq.acme", invented: "eq.x" })).toEqual({
      name: "eq.acme",
    });
  });

  it("normalises a single sort key to the array a multi-key sort uses", () => {
    const schema = listInputSchema(
      defineListSpec({
        filters,
        pagination: { modes: ["offset"], default: "offset" },
      })
    );
    // Express delivers a string for one occurrence and an array for several.
    expect(schema.parse({ sort: "createdAt:asc" })).toMatchObject({
      sort: ["createdAt:asc"],
    });
    expect(
      schema.parse({ sort: ["createdAt:asc", "name:desc"] })
    ).toMatchObject({ sort: ["createdAt:asc", "name:desc"] });
    // Which field may be sorted is the applier's question, like the operators.
    expect(schema.parse({ sort: "name:asc" })).toMatchObject({
      sort: ["name:asc"],
    });
    expect(() => schema.parse({ sort: "" })).toThrow();
  });
});

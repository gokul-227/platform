import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  column,
  defineFilters,
  defineListSpec,
  listInputSchema,
  listResponseSchema,
} from "../src";
import { resolvePageQuery } from "../src/query/page";

const filters = defineFilters({
  status: column.string({ ops: ["eq", "in"], sortable: true }),
  createdAt: column.date({ ops: ["gte", "lte"], sortable: true }),
});

const dual = defineListSpec({
  filters,
  pagination: { modes: ["cursor", "offset"], default: "cursor" },
});
const cursorOnly = defineListSpec({
  filters,
  pagination: { modes: ["cursor"], default: "cursor" },
});
const offsetOnly = defineListSpec({
  filters,
  pagination: { modes: ["offset"], default: "offset" },
});

describe("defineListSpec", () => {
  it("rejects a default mode outside the allowlist", () => {
    expect(() =>
      defineListSpec({
        filters,
        pagination: { modes: ["cursor"], default: "offset" },
      })
    ).toThrow(/default mode 'offset'/);
  });
});

describe("listInputSchema", () => {
  it("dual spec accepts both param families plus sort and filters", () => {
    const schema = listInputSchema(dual);
    expect(
      schema.parse({ page: "2", pageSize: "10", status: "eq.ready" })
    ).toMatchObject({ page: 2, pageSize: 10, status: "eq.ready" });
    expect(schema.parse({ limit: "25", cursor: "abc" })).toMatchObject({
      limit: 25,
      cursor: "abc",
    });
    expect(schema.parse({ sort: "createdAt:desc" })).toMatchObject({
      sort: ["createdAt:desc"],
    });
  });

  it("cursor-only spec has no page/pageSize/sort params", () => {
    const shape = listInputSchema(cursorOnly).shape as Record<string, unknown>;
    expect(Object.keys(shape).sort()).toEqual([
      "createdAt",
      "cursor",
      "limit",
      "status",
    ]);
  });

  it("offset-only spec has no limit/cursor params", () => {
    const shape = listInputSchema(offsetOnly).shape as Record<string, unknown>;
    expect(Object.keys(shape).sort()).toEqual([
      "createdAt",
      "page",
      "pageSize",
      "sort",
      "status",
    ]);
  });
});

describe("listResponseSchema", () => {
  const item = z.object({ id: z.string() });

  it("single-mode envelopes require their meta", () => {
    expect(() =>
      listResponseSchema(cursorOnly, item).parse({ items: [] })
    ).toThrow();
    expect(
      listResponseSchema(cursorOnly, item).parse({
        items: [],
        nextCursor: null,
      })
    ).toEqual({ items: [], nextCursor: null });
    expect(() =>
      listResponseSchema(offsetOnly, item).parse({ items: [] })
    ).toThrow();
  });

  it("dual envelope admits either meta", () => {
    const schema = listResponseSchema(dual, item);
    expect(schema.parse({ items: [], nextCursor: null })).toBeTruthy();
    expect(
      schema.parse({
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
        totalPages: 0,
      })
    ).toBeTruthy();
  });
});

describe("resolvePageQuery", () => {
  it("defaults to the spec's default mode", () => {
    expect(resolvePageQuery(dual.pagination, {})).toEqual({
      mode: "cursor",
      limit: 50,
      cursor: null,
    });
    expect(resolvePageQuery(offsetOnly.pagination, {})).toEqual({
      mode: "offset",
      page: 1,
      pageSize: 50,
      offset: 0,
    });
  });

  it("derives the SQL offset from page and pageSize", () => {
    expect(
      resolvePageQuery(dual.pagination, { page: 3, pageSize: 20 })
    ).toEqual({ mode: "offset", page: 3, pageSize: 20, offset: 40 });
  });

  it("rejects mixing the param families", () => {
    expect(() =>
      resolvePageQuery(dual.pagination, { cursor: "abc", page: 2 })
    ).toThrow(/Mixing/);
  });

  it("rejects a mode outside the allowlist", () => {
    expect(() => resolvePageQuery(cursorOnly.pagination, { page: 2 })).toThrow(
      /does not support offset/
    );
    expect(() =>
      resolvePageQuery(offsetOnly.pagination, { limit: 10 })
    ).toThrow(/does not support cursor/);
  });

  it("rejects sort on a cursor page but allows it on an offset page", () => {
    expect(() =>
      resolvePageQuery(dual.pagination, { limit: 10, sort: ["createdAt:desc"] })
    ).toThrow(/keyset order/);
    expect(
      resolvePageQuery(dual.pagination, { page: 1, sort: ["createdAt:desc"] })
    ).toMatchObject({ mode: "offset" });
  });
});

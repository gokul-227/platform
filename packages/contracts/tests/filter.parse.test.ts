import { describe, expect, it } from "vitest";
import { column, defineFilters, jsonbPath } from "../src";
import { parseFilters, parseSort } from "../src/query/filter.parse";

const memberFilters = defineFilters({
  role: column.string({ ops: ["eq", "in"] }),
  email: column.string({
    ops: ["eq", "startsWith", "endsWith", "contains"],
    column: "user.email",
  }),
  joinedAt: column.date({
    ops: ["gte", "lte"],
    column: "createdAt",
    sortable: true,
  }),
  age: column.number({ ops: ["gt", "lt", "gte", "lte"], sortable: true }),
  active: column.boolean({ ops: ["eq"] }),
  parentId: column.uuid({ ops: ["eq"] }),
});

const propsSpec = defineFilters({
  properties: jsonbPath({ ops: ["hasKey", "eq", "gte", "lt"] }),
});

describe("parseFilters: bare-value shorthand", () => {
  it("treats a bare value as eq.value", () => {
    const out = parseFilters(memberFilters, { role: "owner" });
    expect(out).toEqual([
      {
        field: "role",
        column: "role",
        type: "column",
        parsed: { op: "eq", value: "owner" },
      },
    ]);
  });

  it("does not mistake a value-with-dots for an op prefix", () => {
    // `source.law.lbo_bw` — leading token is not a known op, so the whole
    // string is the bare value.
    const out = parseFilters(memberFilters, { role: "source.law.lbo_bw" });
    expect(out[0]?.parsed).toEqual({ op: "eq", value: "source.law.lbo_bw" });
  });

  it("respects the explicit op prefix when it matches a known op", () => {
    const out = parseFilters(memberFilters, { role: "eq.owner" });
    expect(out[0]?.parsed).toEqual({ op: "eq", value: "owner" });
  });
});

describe("parseFilters: ops + value types", () => {
  it("compiles startsWith.x to ilike with escaped LIKE metacharacters", () => {
    const out = parseFilters(memberFilters, { email: "startsWith.foo_bar%" });
    expect(out[0]?.parsed).toEqual({ op: "ilike", value: "foo\\_bar\\%%" });
    expect(out[0]?.column).toBe("user.email");
  });

  it("compiles endsWith.x to a trailing-match ilike pattern", () => {
    const out = parseFilters(memberFilters, { email: "endsWith.example.com" });
    expect(out[0]?.parsed).toEqual({ op: "ilike", value: "%example.com" });
  });

  it("compiles contains.x to a surrounding-match ilike pattern", () => {
    const out = parseFilters(memberFilters, { email: "contains.marius" });
    expect(out[0]?.parsed).toEqual({ op: "ilike", value: "%marius%" });
  });

  it("parses in.(a,b,c) into an array", () => {
    const out = parseFilters(memberFilters, {
      role: "in.(owner,manager,editor)",
    });
    expect(out[0]?.parsed).toEqual({
      op: "in",
      value: ["owner", "manager", "editor"],
    });
  });

  it("rejects in. without parens", () => {
    expect(() =>
      parseFilters(memberFilters, { role: "in.owner,manager" })
    ).toThrow(/parenthesised form/);
  });

  it("rejects an empty in.() list", () => {
    expect(() => parseFilters(memberFilters, { role: "in.()" })).toThrow(
      /cannot be empty/
    );
  });

  it("coerces date values", () => {
    const out = parseFilters(memberFilters, { joinedAt: "gte.2026-01-01" });
    expect(out[0]?.parsed).toMatchObject({ op: "gte" });
    expect((out[0]?.parsed.value as Date).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });

  it("coerces number values", () => {
    const out = parseFilters(memberFilters, { age: "gte.18" });
    expect(out[0]?.parsed).toEqual({ op: "gte", value: 18 });
  });

  it("coerces boolean values", () => {
    const out = parseFilters(memberFilters, { active: "eq.true" });
    expect(out[0]?.parsed).toEqual({ op: "eq", value: true });
  });

  it("validates UUID values", () => {
    expect(() =>
      parseFilters(memberFilters, { parentId: "eq.not-a-uuid" })
    ).toThrow(/Expected UUID/);
    const ok = parseFilters(memberFilters, {
      parentId: "eq.12345678-1234-1234-1234-123456789012",
    });
    expect(ok[0]?.parsed.value).toBe("12345678-1234-1234-1234-123456789012");
  });

  it("rejects an op the spec didn't declare on the field", () => {
    expect(() => parseFilters(memberFilters, { role: "gte.x" })).toThrow(
      /not allowed/
    );
  });

  it("treats unknown-leading-token values as a bare-eq value (lets `class=source.law.x` work)", () => {
    // `weird` is not a global op token, so the parser falls back to
    // bare-value semantics and the whole string is the eq value.
    const out = parseFilters(memberFilters, { role: "weird.x" });
    expect(out[0]?.parsed).toEqual({ op: "eq", value: "weird.x" });
  });
});

describe("parseFilters: column path override", () => {
  it("threads the spec's column override through (e.g. user.email)", () => {
    const out = parseFilters(memberFilters, { email: "eq.foo@example.test" });
    expect(out[0]?.column).toBe("user.email");
  });

  it("threads the spec's column override through (e.g. joinedAt -> createdAt)", () => {
    const out = parseFilters(memberFilters, { joinedAt: "lte.2026-12-31" });
    expect(out[0]?.column).toBe("createdAt");
  });
});

describe("parseFilters: JSONB paths", () => {
  it("parses the arrow path syntax into path segments", () => {
    const out = parseFilters(propsSpec, {
      "properties->envelope->netArea": "gte.5",
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe("jsonbPath");
    expect(out[0]?.jsonbPath).toEqual(["envelope", "netArea"]);
    expect(out[0]?.parsed).toMatchObject({ op: "gte" });
  });

  it("hasKey takes a single string key", () => {
    const out = parseFilters(propsSpec, {
      "properties->envelope": "hasKey.netArea",
    });
    expect(out[0]?.parsed).toEqual({ op: "hasKey", value: "netArea" });
  });

  it("rejects empty path segments", () => {
    expect(() =>
      parseFilters(propsSpec, { "properties->envelope->": "eq.x" })
    ).toThrow(/empty path/);
  });

  it("ignores wire keys that don't start with the jsonbPath field name", () => {
    const out = parseFilters(propsSpec, { unrelated: "eq.x" });
    expect(out).toEqual([]);
  });
});

describe("parseSort", () => {
  it("parses a single field:dir token", () => {
    const out = parseSort(memberFilters, "joinedAt:desc");
    expect(out).toEqual([
      { field: "joinedAt", column: "createdAt", dir: "desc" },
    ]);
  });

  it("parses multi-key sort (array) in input order", () => {
    const out = parseSort(memberFilters, ["joinedAt:asc", "age:desc"]);
    expect(out.map((s) => `${s.field}:${s.dir}`)).toEqual([
      "joinedAt:asc",
      "age:desc",
    ]);
  });

  it("rejects sorts on non-sortable fields", () => {
    expect(() => parseSort(memberFilters, "role:asc")).toThrow(/not sortable/);
  });

  it("rejects malformed sort tokens", () => {
    expect(() => parseSort(memberFilters, "joinedAt")).toThrow(
      /expected `field:asc/
    );
  });

  it("rejects invalid directions", () => {
    expect(() => parseSort(memberFilters, "joinedAt:sideways")).toThrow(
      /Invalid sort direction/
    );
  });

  it("returns an empty array on undefined input", () => {
    expect(parseSort(memberFilters, undefined)).toEqual([]);
  });
});

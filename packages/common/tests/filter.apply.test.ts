import { column, defineFilters } from "@aec-craft/platform-contracts";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  filterConditions,
  sortExpressions,
} from "../src/drizzle/query/filter.apply";

const spec = defineFilters({
  status: column.string({ ops: ["eq", "in"], sortable: true }),
  createdAt: column.date({ ops: ["gte", "lte"], sortable: true }),
  email: column.string({ ops: ["startsWith"], column: "user.email" }),
});

const dialect = new PgDialect();
const render = (fragments: ReturnType<typeof filterConditions>) =>
  fragments.map((fragment) => dialect.sqlToQuery(fragment).sql);

describe("drizzle filterConditions", () => {
  it("maps wire camelCase fields to snake_case identifiers", () => {
    const [condition] = render(
      filterConditions(spec, { createdAt: "gte.2026-01-01" })
    );
    expect(condition).toContain('"created_at"');
    expect(condition).not.toContain('"createdAt"');
  });

  it("keeps dotted column overrides, snake-casing each segment", () => {
    const [condition] = render(
      filterConditions(spec, { email: "startsWith.marius" })
    );
    expect(condition).toContain('"user"."email"');
  });
});

describe("drizzle sortExpressions", () => {
  it("emits snake_case ORDER BY expressions in token order", () => {
    const rendered = render(
      sortExpressions(spec, { sort: ["createdAt:desc", "status:asc"] })
    );
    expect(rendered[0]).toBe('"created_at" DESC');
    expect(rendered[1]).toBe('"status" ASC');
  });
});

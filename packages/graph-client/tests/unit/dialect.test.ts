import { describe, expect, it } from "vitest";

import { MemgraphDialect, Neo4jDialect } from "../../src/dialect";

describe("MemgraphDialect", () => {
  const dialect = new MemgraphDialect();

  it("reports engine 'memgraph'", () => {
    expect(dialect.engine).toBe("memgraph");
  });

  it("bootstrap uses Memgraph index DDL (CREATE INDEX ON :Node(...))", () => {
    const statements = dialect.bootstrapStatements();
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(s.text).toMatch(/^CREATE INDEX ON :Node\(\w+\)$/);
      expect(s.params).toEqual({});
    }
    expect(statements.map((s) => s.text)).toContain(
      "CREATE INDEX ON :Node(id)"
    );
  });
});

describe("Neo4jDialect", () => {
  const dialect = new Neo4jDialect();

  it("reports engine 'neo4j'", () => {
    expect(dialect.engine).toBe("neo4j");
  });

  it("bootstrap uses CREATE CONSTRAINT / CREATE INDEX ... IF NOT EXISTS", () => {
    const statements = dialect.bootstrapStatements();
    expect(statements.length).toBeGreaterThan(0);
    expect(statements[0]?.text).toContain("CREATE CONSTRAINT");
    for (const s of statements) {
      expect(s.text).toContain("IF NOT EXISTS");
      expect(s.params).toEqual({});
    }
  });
});

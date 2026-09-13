import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AuditApiModule } from "../../src/config/api.module";
import { parseConfig } from "../../src/config/config";
import { auditApiDocument } from "../../src/nest/openapi";

describe("parseConfig", () => {
  it("accepts a database url", () => {
    expect(
      parseConfig({ databaseUrl: "postgres://user:pw@localhost:5432/platform" })
    ).toEqual({
      databaseUrl: "postgres://user:pw@localhost:5432/platform",
    });
  });

  it("refuses a bare host, and a missing url", () => {
    expect(() => parseConfig({ databaseUrl: "localhost/platform" })).toThrow(
      z.ZodError
    );
    expect(() => parseConfig({})).toThrow(z.ZodError);
  });

  it("drops anything the package does not read", () => {
    expect(
      parseConfig({
        databaseUrl: "postgres://localhost/platform",
        ketoReadUrl: "http://localhost:4466",
      })
    ).toEqual({ databaseUrl: "postgres://localhost/platform" });
  });
});

describe("AuditApiModule.forRoot", () => {
  it("validates at boot rather than on the first query", () => {
    expect(() =>
      AuditApiModule.forRoot({ databaseUrl: "localhost/platform" })
    ).toThrow(z.ZodError);
  });

  it("exports the database and the audit module to the host", () => {
    const dynamic = AuditApiModule.forRoot({
      databaseUrl: "postgres://localhost/platform",
    });
    expect(dynamic.module).toBe(AuditApiModule);
    expect(dynamic.exports).toHaveLength(3);
  });
});

describe("auditApiDocument", () => {
  it("serves the audit portal at its own path, with one feed tagged", () => {
    expect(auditApiDocument.path).toBe("openapi-audit");
    expect(auditApiDocument.include).toContain(AuditApiModule);
    expect(auditApiDocument.tags?.map((tag) => tag.name)).toEqual([
      "Audit events",
    ]);
  });
});

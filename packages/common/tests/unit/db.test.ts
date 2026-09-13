import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "../../src/db";

describe("isUniqueViolation", () => {
  it("returns true for the pg SQLSTATE 23505 envelope", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("returns true even when other pg fields are present", () => {
    expect(
      isUniqueViolation({
        code: "23505",
        detail: "Key (slug)=(acme) already exists.",
        constraint: "org_slug_key",
      })
    ).toBe(true);
  });

  it("returns false for other SQLSTATE codes", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false); // FK violation
    expect(isUniqueViolation({ code: "23514" })).toBe(false); // CHECK violation
  });

  it("returns false for non-object / null / primitive errors", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(23_505)).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });

  it("returns false when code is missing or non-string", () => {
    expect(isUniqueViolation({})).toBe(false);
    expect(isUniqueViolation({ code: 23_505 })).toBe(false);
  });
});

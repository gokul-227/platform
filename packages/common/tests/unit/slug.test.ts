import { makeSlug, SLUG_RE, uniqueSlug } from "@aec-craft/platform-common";
import { PlatformError, ValidationErrors } from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";

describe("SLUG_RE", () => {
  const valid = [
    "a",
    "ab",
    "a1",
    "1a",
    "abc-def",
    "x".repeat(64),
    "abc-123-def-456",
  ];
  const invalid = [
    "",
    "-leading",
    "trailing-",
    "Has-Upper",
    "with_underscore",
    "double--dash", // double dash *is* allowed by the regex; check separately
    "ümlaut",
    "x".repeat(65),
  ];

  it.each(valid)("accepts %s", (s) => {
    expect(SLUG_RE.test(s)).toBe(true);
  });

  // The regex permits `a-b--c`; record that explicitly so a tightening change
  // surfaces here instead of in a downstream DTO that depended on it.
  it("currently allows consecutive dashes (documented quirk)", () => {
    expect(SLUG_RE.test("a--b")).toBe(true);
  });

  it.each(invalid.filter((s) => s !== "double--dash"))("rejects %s", (s) => {
    expect(SLUG_RE.test(s)).toBe(false);
  });
});

describe("makeSlug", () => {
  it("lowercases and dashes", () => {
    expect(makeSlug("Hello World")).toBe("hello-world");
  });

  it("strips diacritics", () => {
    expect(makeSlug("Café Bar")).toBe("cafe-bar");
  });

  it("replaces '&' with 'and' (slugify default substitution)", () => {
    // slugify's `strict: true` strips punctuation but applies the built-in
    // charmap first, so `&` becomes `and` in the slug — record so a charmap
    // change shows up here.
    expect(makeSlug("Foo & Bar!!")).toBe("foo-and-bar");
  });

  it("clamps to 64 chars", () => {
    const out = makeSlug("a".repeat(200));
    expect(out.length).toBeLessThanOrEqual(64);
  });

  it("returns empty string for input that has no slug-able chars", () => {
    // slugify with strict mode discards everything.
    expect(makeSlug("???")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("returns base when free", async () => {
    const result = await uniqueSlug("acme", async () => true);
    expect(result).toBe("acme");
  });

  it("appends -2, -3, ... until free", async () => {
    const taken = new Set(["acme", "acme-2", "acme-3"]);
    const result = await uniqueSlug("acme", async (c) => !taken.has(c));
    expect(result).toBe("acme-4");
  });

  it("strips an existing numeric suffix before retrying", async () => {
    // "acme-5" is requested, but free → returned as-is on first probe.
    expect(await uniqueSlug("acme-5", async () => true)).toBe("acme-5");

    // "acme-5" is taken → retry root "acme" + -2.
    const taken = new Set(["acme-5"]);
    expect(await uniqueSlug("acme-5", async (c) => !taken.has(c))).toBe(
      "acme-2"
    );
  });

  it("throws PlatformError(VALIDATION_FAILED) after 100 attempts", async () => {
    await expect(uniqueSlug("acme", async () => false)).rejects.toMatchObject({
      code: ValidationErrors.FAILED.code,
    });
    await expect(uniqueSlug("acme", async () => false)).rejects.toBeInstanceOf(
      PlatformError
    );
  });

  it("clamps each candidate to 64 chars", async () => {
    // Base of length 64 with suffix `-200` would overflow — verify clamp.
    const base = "a".repeat(64);
    const seen: string[] = [];
    await uniqueSlug(base, async (c) => {
      seen.push(c);
      return c === seen[10]; // hit after 11 probes
    });
    for (const c of seen) {
      expect(c.length).toBeLessThanOrEqual(64);
    }
  });
});

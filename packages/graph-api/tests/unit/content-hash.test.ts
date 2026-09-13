import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  contentHash,
} from "../../src/modules/versions/content-hash";

describe("canonicalJson", () => {
  it("is stable across key insertion order", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("sorts keys recursively in nested objects", () => {
    const left = { outer: { z: true, a: { y: 2, x: 1 } }, name: "n" };
    const right = { name: "n", outer: { a: { x: 1, y: 2 }, z: true } };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(canonicalJson(left)).toBe(
      '{"name":"n","outer":{"a":{"x":1,"y":2},"z":true}}'
    );
  });

  it("keeps array order (order is meaningful)", () => {
    expect(canonicalJson([1, 2, 3])).toBe("[1,2,3]");
    expect(canonicalJson([3, 2, 1])).toBe("[3,2,1]");
    expect(canonicalJson({ items: ["b", "a"] })).not.toBe(
      canonicalJson({ items: ["a", "b"] })
    );
  });

  it("sorts keys of objects inside arrays without reordering the array", () => {
    expect(
      canonicalJson([
        { b: 2, a: 1 },
        { d: 4, c: 3 },
      ])
    ).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
  });

  it("drops undefined members (JSON semantics)", () => {
    expect(canonicalJson({ a: 1, gone: undefined })).toBe(
      canonicalJson({ a: 1 })
    );
  });

  it("passes scalars and null through", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("s")).toBe('"s"');
    expect(canonicalJson(true)).toBe("true");
  });
});

describe("contentHash", () => {
  it("is equal for structurally equal values regardless of key order", () => {
    const a = contentHash({
      name: "K",
      properties: { envelope: { netArea: 5.8, height: 2.45 } },
    });
    const b = contentHash({
      properties: { envelope: { height: 2.45, netArea: 5.8 } },
      name: "K",
    });
    expect(a).toBe(b);
  });

  it("differs for different values", () => {
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: "1" }));
    expect(contentHash([1, 2])).not.toBe(contentHash([2, 1]));
  });

  it("has sha256 hex shape (64 lowercase hex chars)", () => {
    const hash = contentHash({ any: "value" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

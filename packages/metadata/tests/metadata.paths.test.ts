import { PlatformError, ValidationErrors } from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";
import { deleteAtPath, parseMetadataKeyPath, setAtPath } from "../src/index";

describe("parseMetadataKeyPath", () => {
  it("splits a dotted path into segments", () => {
    expect(parseMetadataKeyPath("apps.platform.theme")).toEqual([
      "apps",
      "platform",
      "theme",
    ]);
  });

  it("accepts a single segment", () => {
    expect(parseMetadataKeyPath("plan")).toEqual(["plan"]);
  });

  it.each([
    "",
    ".apps",
    "apps.",
    "apps..platform",
  ])("throws VALIDATION_FAILED on blank segments: %j", (bad) => {
    expect(() => parseMetadataKeyPath(bad)).toThrow(PlatformError);
    try {
      parseMetadataKeyPath(bad);
    } catch (err) {
      expect((err as PlatformError).code).toBe(ValidationErrors.FAILED.code);
    }
  });
});

describe("setAtPath", () => {
  it("sets a top-level key", () => {
    expect(setAtPath({}, ["plan"], "pro")).toEqual({ plan: "pro" });
  });

  it("creates missing parents", () => {
    expect(setAtPath({}, ["apps", "platform", "theme"], "dark")).toEqual({
      apps: { platform: { theme: "dark" } },
    });
  });

  it("preserves sibling keys at every level", () => {
    const before = {
      apps: { platform: { fov: 60 }, other: { x: 1 } },
      top: true,
    };
    const after = setAtPath(before, ["apps", "platform", "theme"], "dark");
    expect(after).toEqual({
      apps: { platform: { fov: 60, theme: "dark" }, other: { x: 1 } },
      top: true,
    });
  });

  it("overwrites only the targeted node", () => {
    expect(setAtPath({ a: { b: 1, c: 2 } }, ["a", "b"], 9)).toEqual({
      a: { b: 9, c: 2 },
    });
  });

  it("replaces a non-object encountered along the path with an object", () => {
    expect(setAtPath({ a: "scalar" }, ["a", "b"], 1)).toEqual({ a: { b: 1 } });
  });

  it("accepts object, array, and null values", () => {
    expect(setAtPath({}, ["x"], { y: 1 })).toEqual({ x: { y: 1 } });
    expect(setAtPath({}, ["x"], [1, 2])).toEqual({ x: [1, 2] });
    expect(setAtPath({}, ["x"], null)).toEqual({ x: null });
  });

  it("does not mutate the input bag", () => {
    const before = { apps: { platform: { fov: 60 } } };
    const snapshot = structuredClone(before);
    setAtPath(before, ["apps", "platform", "theme"], "dark");
    expect(before).toEqual(snapshot);
  });
});

describe("deleteAtPath", () => {
  it("removes a top-level key", () => {
    expect(deleteAtPath({ plan: "pro", keep: 1 }, ["plan"])).toEqual({
      keep: 1,
    });
  });

  it("removes a nested key, preserving siblings", () => {
    expect(
      deleteAtPath({ apps: { platform: { theme: "dark", fov: 60 } } }, [
        "apps",
        "platform",
        "theme",
      ])
    ).toEqual({
      apps: { platform: { fov: 60 } },
    });
  });

  it("is a no-op when the key does not exist", () => {
    const bag = { a: { b: 1 } };
    expect(deleteAtPath(bag, ["a", "z"])).toEqual({ a: { b: 1 } });
    expect(deleteAtPath(bag, ["nope"])).toEqual({ a: { b: 1 } });
  });

  it("is a no-op when an intermediate segment is not an object", () => {
    expect(deleteAtPath({ a: "scalar" }, ["a", "b"])).toEqual({ a: "scalar" });
  });

  it("does not mutate the input bag", () => {
    const before = { apps: { platform: { theme: "dark", fov: 60 } } };
    const snapshot = structuredClone(before);
    deleteAtPath(before, ["apps", "platform", "theme"]);
    expect(before).toEqual(snapshot);
  });
});

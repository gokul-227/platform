import { describe, expect, it } from "vitest";

import {
  resolveSetting,
  type SettingDef,
} from "../src/platform/settings/setting";

const units: SettingDef<string> = {
  key: "units.length",
  fallback: "mm",
  tiers: ["org", "project", "user"],
};

describe("resolveSetting", () => {
  it("falls back when no tier holds a value", () => {
    expect(resolveSetting(units, {})).toEqual({
      value: "mm",
      source: "fallback",
    });
  });

  it("lets the more specific tier win", () => {
    expect(resolveSetting(units, { org: "mm" })).toEqual({
      value: "mm",
      source: "org",
    });
    expect(resolveSetting(units, { org: "mm", project: "ft" })).toEqual({
      value: "ft",
      source: "project",
    });
    expect(
      resolveSetting(units, { org: "mm", project: "ft", user: "in" })
    ).toEqual({ value: "in", source: "user" });
  });

  it("skips a tier that holds nothing rather than treating it as a value", () => {
    expect(resolveSetting(units, { org: "mm", user: "in" })).toEqual({
      value: "in",
      source: "user",
    });
  });

  it("distinguishes a stored falsy value from an absent one", () => {
    const flag: SettingDef<boolean> = {
      key: "grid.snap",
      fallback: true,
      tiers: ["org", "user"],
    };
    expect(resolveSetting(flag, { user: false })).toEqual({
      value: false,
      source: "user",
    });
  });

  it("takes precedence from the ladder, not from how the def lists it", () => {
    const backwards: SettingDef<string> = {
      key: "units.length",
      fallback: "mm",
      tiers: ["user", "org"],
    };
    expect(resolveSetting(backwards, { org: "mm", user: "in" })).toEqual({
      value: "in",
      source: "user",
    });
  });

  it("ignores a tier the setting does not declare", () => {
    // A value left in a bag by a setting that has since narrowed its tiers
    // must not come back to life.
    const projectOnly: SettingDef<string> = {
      key: "coordinates.northAngle",
      fallback: "0",
      tiers: ["org", "project"],
    };
    expect(resolveSetting(projectOnly, { org: "0", user: "42" })).toEqual({
      value: "0",
      source: "org",
    });
  });
});

import { afterEach, describe, expect, it } from "vitest";

import { VersionController } from "../../../src/health/version.controller";

const ENV_KEYS = [
  "SERVICE_VERSION",
  "SERVICE_COMMIT",
  "SERVICE_BUILD_TIME",
] as const;

describe("VersionController", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  function snapshot(): void {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
    }
  }

  it("defaults version to 'dev' and commit/buildTime to null when env unset", () => {
    snapshot();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    const ctrl = new VersionController();
    expect(ctrl.version()).toEqual({
      version: "dev",
      commit: null,
      buildTime: null,
      nodeVersion: process.version,
    });
  });

  it("reflects env values when set", () => {
    snapshot();
    process.env.SERVICE_VERSION = "1.2.3";
    process.env.SERVICE_COMMIT = "abc123";
    process.env.SERVICE_BUILD_TIME = "2025-01-01T00:00:00Z";

    expect(new VersionController().version()).toEqual({
      version: "1.2.3",
      commit: "abc123",
      buildTime: "2025-01-01T00:00:00Z",
      nodeVersion: process.version,
    });
  });
});

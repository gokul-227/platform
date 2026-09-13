import { describe, expect, it, vi } from "vitest";

import { memoizePerRequest, withAuthorizationCache } from "../../src/cache";

describe("memoizePerRequest", () => {
  it("computes every time when there is no request around it", async () => {
    const compute = vi.fn(() => Promise.resolve("answer"));
    await memoizePerRequest("key", compute);
    await memoizePerRequest("key", compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("answers a repeated question once inside one request", async () => {
    const compute = vi.fn(() => Promise.resolve("answer"));
    await withAuthorizationCache(async () => {
      expect(await memoizePerRequest("key", compute)).toBe("answer");
      expect(await memoizePerRequest("key", compute)).toBe("answer");
    });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("keys separately, so two questions are two calls", async () => {
    const compute = vi.fn((answer: string) => Promise.resolve(answer));
    await withAuthorizationCache(async () => {
      await memoizePerRequest("read:group-1", () => compute("a"));
      await memoizePerRequest("read:group-2", () => compute("b"));
    });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("shares one call between concurrent askers", async () => {
    const compute = vi.fn(() => Promise.resolve("answer"));
    await withAuthorizationCache(async () => {
      await Promise.all([
        memoizePerRequest("key", compute),
        memoizePerRequest("key", compute),
        memoizePerRequest("key", compute),
      ]);
    });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("does not remember a failure", async () => {
    const compute = vi
      .fn()
      .mockRejectedValueOnce(new Error("keto is down"))
      .mockResolvedValueOnce("answer");
    await withAuthorizationCache(async () => {
      await expect(memoizePerRequest("key", compute)).rejects.toThrow(
        "keto is down"
      );
      expect(await memoizePerRequest("key", compute)).toBe("answer");
    });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("gives each request its own memo", async () => {
    const compute = vi.fn(() => Promise.resolve("answer"));
    await withAuthorizationCache(() => memoizePerRequest("key", compute));
    await withAuthorizationCache(() => memoizePerRequest("key", compute));
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("keeps a nested request's memo out of the outer one", async () => {
    const compute = vi.fn(() => Promise.resolve("answer"));
    await withAuthorizationCache(async () => {
      await memoizePerRequest("key", compute);
      await withAuthorizationCache(() => memoizePerRequest("key", compute));
      await memoizePerRequest("key", compute);
    });
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

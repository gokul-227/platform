import { describe, expect, it } from "vitest";
import { PlatformError } from "../src/errors";

import {
  decodeCursor,
  encodeCursor,
  fetchCursorPage,
} from "../src/query/page.cursor";

describe("decodeCursor", () => {
  it("round-trips the keyset boundary", () => {
    const timestamp = new Date("2026-08-21T10:00:00.500Z");
    const id = "0f0182e1-ce87-4c63-894b-ed971d7945d6";
    expect(decodeCursor(encodeCursor(timestamp, id))).toEqual({
      id,
      timestamp,
    });
  });

  it("round-trips a renamed timestamp field", () => {
    const timestamp = new Date("2026-08-21T10:00:00.500Z");
    const id = "0f0182e1-ce87-4c63-894b-ed971d7945d6";
    const token = encodeCursor(timestamp, id, "updatedAt");
    expect(decodeCursor(token, "updatedAt").timestamp).toEqual(timestamp);
  });

  /**
   * Refused rather than degraded. Falling back to the head of the list reads as
   * a fresh first page, so a client paging on a token it cannot decode loops
   * over page one instead of being told the cursor is wrong.
   */
  it.each([
    ["not base64url at all", "not a cursor!!"],
    ["base64url that is not JSON", Buffer.from("nope").toString("base64url")],
    ["JSON without an id", encodeCursor(new Date(), "x").slice(0, 12)],
  ])("refuses a token that is %s", (_case, token) => {
    expect(() => decodeCursor(token)).toThrow(PlatformError);
    expect(() => decodeCursor(token)).toThrow(/cursor/i);
  });

  it("refuses a token whose timestamp field is not the one this list uses", () => {
    const token = encodeCursor(
      new Date(),
      "0f0182e1-ce87-4c63-894b-ed971d7945d6",
      "updatedAt"
    );
    expect(() => decodeCursor(token)).toThrow(PlatformError);
  });

  it("refuses a token whose timestamp is not a date", () => {
    const token = Buffer.from(
      JSON.stringify({ createdAt: "yesterday", id: "a" }),
      "utf8"
    ).toString("base64url");
    expect(() => decodeCursor(token)).toThrow(/not a date/);
  });
});

describe("fetchCursorPage", () => {
  const rowsOf = (ids: string[]) =>
    ids.map((id, index) => ({
      id,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    }));

  it("trims the probe row and points the next cursor at the tail it kept", async () => {
    const asked: number[] = [];
    const result = await fetchCursorPage(
      { mode: "cursor", limit: 2, cursor: null },
      (limit) => {
        asked.push(limit);
        return Promise.resolve(rowsOf(["a", "b", "c"]));
      },
      (row) => row.id,
      (row) => [row.createdAt, row.id]
    );
    expect(asked).toEqual([3]);
    expect(result.items).toEqual(["a", "b"]);
    expect(decodeCursor(result.nextCursor as string)).toEqual({
      id: "b",
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, 1)),
    });
  });

  it("exhausts to a null cursor when the probe row is absent", async () => {
    const result = await fetchCursorPage(
      { mode: "cursor", limit: 2, cursor: null },
      () => Promise.resolve(rowsOf(["a", "b"])),
      (row) => row.id,
      (row) => [row.createdAt, row.id]
    );
    expect(result).toMatchObject({ items: ["a", "b"], nextCursor: null });
  });

  it("carries the list's own timestamp field into the token", async () => {
    const result = await fetchCursorPage(
      { mode: "cursor", limit: 1, cursor: null },
      () => Promise.resolve(rowsOf(["a", "b"])),
      (row) => row.id,
      (row) => [row.createdAt, row.id],
      "updatedAt"
    );
    expect(decodeCursor(result.nextCursor as string, "updatedAt").id).toBe("a");
  });
});

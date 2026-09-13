import { describe, expect, it } from "vitest";
import { fetchOffsetPage } from "../src/query/page.offset";

describe("fetchOffsetPage", () => {
  const rowsOf = (total: number, ids: string[]) =>
    ids.map((id) => ({ id, total }));

  it("assembles the envelope from windowed rows", async () => {
    const result = await fetchOffsetPage(
      { mode: "offset", page: 2, pageSize: 2, offset: 2 },
      () => Promise.resolve(rowsOf(5, ["c", "d"])),
      (row) => row.id,
      (row) => row.total
    );
    expect(result).toEqual({
      items: ["c", "d"],
      page: 2,
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
  });

  it("recovers the true total on an out-of-range page", async () => {
    const calls: [number, number][] = [];
    const result = await fetchOffsetPage(
      { mode: "offset", page: 9, pageSize: 50, offset: 400 },
      (limit, offset) => {
        calls.push([limit, offset]);
        return Promise.resolve(offset >= 5 ? [] : rowsOf(5, ["a"]));
      },
      (row) => row.id,
      (row) => row.total
    );
    expect(calls).toEqual([
      [50, 400],
      [1, 0],
    ]);
    expect(result).toMatchObject({ items: [], total: 5, totalPages: 1 });
  });

  it("reports zero without a probe when page 1 is empty", async () => {
    const calls: [number, number][] = [];
    const result = await fetchOffsetPage(
      { mode: "offset", page: 1, pageSize: 50, offset: 0 },
      (limit, offset) => {
        calls.push([limit, offset]);
        return Promise.resolve([] as { id: string; total: number }[]);
      },
      (row) => row.id,
      (row) => row.total
    );
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ items: [], total: 0, totalPages: 0 });
  });
});

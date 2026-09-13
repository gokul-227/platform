/**
 * Reading a cell back out of a driver.
 *
 * Both stores widen a number on the way out: Postgres returns numeric as a
 * string, and the graph driver returns an integer as an object with a low word.
 * A cell that is neither is null rather than NaN, so a wrong column reads as
 * absent instead of as arithmetic.
 */
export function asNumber(cell: unknown): number | null {
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? cell : null;
  }
  if (typeof cell === "bigint") {
    return Number(cell);
  }
  if (typeof cell === "string" && cell.trim() !== "") {
    const parsed = Number(cell);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (cell && typeof cell === "object" && "low" in cell) {
    const low = (cell as { low: unknown }).low;
    return typeof low === "number" ? low : null;
  }
  return null;
}

export function asString(cell: unknown): string | null {
  if (typeof cell === "string") {
    return cell;
  }
  if (typeof cell === "number" || typeof cell === "bigint") {
    return String(cell);
  }
  return null;
}

/** One grouped row: the group's label and its aggregate. */
export interface GroupedValue {
  group: string;
  value: number;
}

/** One result row: column name to value. */
export type Row = Record<string, unknown>;

/** Scalars and scalar arrays: what either driver will bind as a parameter. */
export type QueryParam = string | number | boolean | (string | number)[];

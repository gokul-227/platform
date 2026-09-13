import { type SQL, sql } from "drizzle-orm";

/**
 * The SQL half of offset mode: project it onto every row of the page query and
 * `fetchOffsetPage`'s `totalOf` reads it back, so page and total come from one
 * query.
 */
export function totalOver(): SQL<number> {
  return sql<number>`(count(*) over())::int`;
}

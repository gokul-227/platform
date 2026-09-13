import type { QuerySpec } from "@aec-craft/platform-contracts";
import { DatabasePoolToken } from "@aec-craft/platform-graph-api/nest";
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import type { AnalysisScope } from "../analysis.scope";
import type { GroupedValue, Row } from "./sql.cell";
import { asNumber, asString } from "./sql.cell";
import { createSqlDialect } from "./sql.dialect";

/**
 * The pool rather than drizzle: the dialect has already written the text and
 * collected the parameters, so drizzle would only take them apart again.
 */
@Injectable()
export class SqlQueryService {
  constructor(@Inject(DatabasePoolToken) private readonly pool: Pool) {}

  async rows(scope: AnalysisScope, spec: QuerySpec): Promise<Row[]> {
    const compiled = createSqlDialect({
      projectId: scope.projectId,
      readableGroups: scope.readableGroups,
    }).compile(spec);
    const result = await this.pool.query(compiled.text, compiled.params);
    return result.rows as Row[];
  }

  /**
   * Null is not zero: a count of nothing is zero, an average of nothing is
   * unknown, and the caller decides which it wanted.
   */
  async scalar(scope: AnalysisScope, spec: QuerySpec): Promise<number | null> {
    const rows = await this.rows(scope, spec);
    return asNumber(rows[0]?.value);
  }

  /** The `{ group, value }` rows of a grouped spec, in the order the store returned. */
  async grouped(
    scope: AnalysisScope,
    spec: QuerySpec
  ): Promise<GroupedValue[]> {
    const rows = await this.rows(scope, spec);
    return rows
      .map((row) => ({
        group: asString(row.group),
        value: asNumber(row.value),
      }))
      .filter(
        (row): row is GroupedValue => row.group !== null && row.value !== null
      );
  }
}

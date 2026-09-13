import type { RatioInput, RatioResponse } from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { AnalysisScope } from "../analysis.scope";
import { SqlQueryService } from "../query/sql.query.service";

@Injectable()
export class AnalysisRatioService {
  constructor(@Inject(SqlQueryService) private readonly sql: SqlQueryService) {}

  /** Both operands come back: a null ratio has three different causes. */
  async analyse(
    scope: AnalysisScope,
    input: RatioInput
  ): Promise<RatioResponse> {
    const [numerator, denominator] = await Promise.all([
      this.sql.scalar(scope, input.numerator),
      this.sql.scalar(scope, input.denominator),
    ]);

    if (numerator === null || denominator === null || denominator === 0) {
      return { denominator, numerator, value: null };
    }
    const value = numerator / denominator;
    return {
      denominator,
      numerator,
      value: input.isPercent ? value * 100 : value,
    };
  }
}

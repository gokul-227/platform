import type {
  QuantityInput,
  QuantityResponse,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { AnalysisScope } from "../analysis.scope";
import { SqlQueryService } from "../query/sql.query.service";

@Injectable()
export class AnalysisQuantityService {
  constructor(@Inject(SqlQueryService) private readonly sql: SqlQueryService) {}

  async analyse(
    scope: AnalysisScope,
    input: QuantityInput
  ): Promise<QuantityResponse> {
    if (input.groupBy) {
      return { grouped: true, groups: await this.sql.grouped(scope, input) };
    }
    return { grouped: false, value: await this.sql.scalar(scope, input) };
  }
}

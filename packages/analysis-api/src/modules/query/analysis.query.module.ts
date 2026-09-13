import { Module } from "@nestjs/common";

import { CypherQueryService } from "./cypher.query.service";
import { SqlQueryService } from "./sql.query.service";

/**
 * Select, filter, aggregate and group go to Postgres; traversal and components
 * go to the projection, which trails writes by the sync lag and is absent where
 * no graph database is configured. An aggregate is evidence a verdict cites, so
 * it answers from the row that was committed.
 */
@Module({
  providers: [CypherQueryService, SqlQueryService],
  exports: [CypherQueryService, SqlQueryService],
})
export class AnalysisQueryModule {}

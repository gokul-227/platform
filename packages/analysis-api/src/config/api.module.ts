import { Module } from "@nestjs/common";

import { AnalysisModule } from "../modules/analysis.module";

/**
 * Nothing to configure: this package owns no tables. It reads the graph slice,
 * so `GraphApiModule` must be registered.
 *
 * The circulation analyses read the projection and answer 503 without
 * `graphDatabase` configured on that module.
 */
@Module({
  imports: [AnalysisModule],
  exports: [AnalysisModule],
})
export class AnalysisApiModule {}

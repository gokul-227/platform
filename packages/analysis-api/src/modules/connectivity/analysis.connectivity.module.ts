import { Module } from "@nestjs/common";

import { AnalysisQueryModule } from "../query/analysis.query.module";

import { AnalysisConnectivityController } from "./analysis.connectivity.controller";
import { AnalysisConnectivityService } from "./analysis.connectivity.service";

/**
 * One analysis, one module, one directory. Retiring it is deleting this folder
 * and the line that imports it, with nothing of it left anywhere else.
 */
@Module({
  imports: [AnalysisQueryModule],
  controllers: [AnalysisConnectivityController],
  providers: [AnalysisConnectivityService],
  exports: [AnalysisConnectivityService],
})
export class AnalysisConnectivityModule {}

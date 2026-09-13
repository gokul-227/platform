import { Module } from "@nestjs/common";

import { AnalysisQueryModule } from "../query/analysis.query.module";

import { AnalysisRatioController } from "./analysis.ratio.controller";
import { AnalysisRatioService } from "./analysis.ratio.service";

@Module({
  imports: [AnalysisQueryModule],
  controllers: [AnalysisRatioController],
  providers: [AnalysisRatioService],
  exports: [AnalysisRatioService],
})
export class AnalysisRatioModule {}

import { Module } from "@nestjs/common";

import { AnalysisQueryModule } from "../query/analysis.query.module";

import { AnalysisQuantityController } from "./analysis.quantity.controller";
import { AnalysisQuantityService } from "./analysis.quantity.service";

@Module({
  imports: [AnalysisQueryModule],
  controllers: [AnalysisQuantityController],
  providers: [AnalysisQuantityService],
  exports: [AnalysisQuantityService],
})
export class AnalysisQuantityModule {}

import { Module } from "@nestjs/common";

import { AnalysisQueryModule } from "../query/analysis.query.module";

import { AnalysisEgressController } from "./analysis.egress.controller";
import { AnalysisEgressService } from "./analysis.egress.service";

@Module({
  imports: [AnalysisQueryModule],
  controllers: [AnalysisEgressController],
  providers: [AnalysisEgressService],
  exports: [AnalysisEgressService],
})
export class AnalysisEgressModule {}

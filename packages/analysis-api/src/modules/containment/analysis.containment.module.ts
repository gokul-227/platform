import { Module } from "@nestjs/common";

import { AnalysisQueryModule } from "../query/analysis.query.module";

import { AnalysisContainmentController } from "./analysis.containment.controller";
import { AnalysisContainmentService } from "./analysis.containment.service";

@Module({
  imports: [AnalysisQueryModule],
  controllers: [AnalysisContainmentController],
  providers: [AnalysisContainmentService],
  exports: [AnalysisContainmentService],
})
export class AnalysisContainmentModule {}

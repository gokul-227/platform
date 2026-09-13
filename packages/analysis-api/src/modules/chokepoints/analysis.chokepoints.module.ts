import { Module } from "@nestjs/common";

import { AnalysisQueryModule } from "../query/analysis.query.module";

import { AnalysisChokepointsController } from "./analysis.chokepoints.controller";
import { AnalysisChokepointsService } from "./analysis.chokepoints.service";

@Module({
  imports: [AnalysisQueryModule],
  controllers: [AnalysisChokepointsController],
  providers: [AnalysisChokepointsService],
  exports: [AnalysisChokepointsService],
})
export class AnalysisChokepointsModule {}

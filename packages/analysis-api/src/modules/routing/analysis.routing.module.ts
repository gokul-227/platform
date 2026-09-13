import { Module } from "@nestjs/common";

import { AnalysisQueryModule } from "../query/analysis.query.module";

import { AnalysisRoutingController } from "./analysis.routing.controller";
import { AnalysisRoutingService } from "./analysis.routing.service";

@Module({
  imports: [AnalysisQueryModule],
  controllers: [AnalysisRoutingController],
  providers: [AnalysisRoutingService],
  exports: [AnalysisRoutingService],
})
export class AnalysisRoutingModule {}

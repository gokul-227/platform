import { Module } from "@nestjs/common";

import { AnalysisQueryModule } from "../query/analysis.query.module";

import { AnalysisAdjacencyController } from "./analysis.adjacency.controller";
import { AnalysisAdjacencyService } from "./analysis.adjacency.service";

@Module({
  imports: [AnalysisQueryModule],
  controllers: [AnalysisAdjacencyController],
  providers: [AnalysisAdjacencyService],
  exports: [AnalysisAdjacencyService],
})
export class AnalysisAdjacencyModule {}

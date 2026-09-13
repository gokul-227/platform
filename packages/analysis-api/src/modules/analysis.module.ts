import { Module } from "@nestjs/common";

import { AnalysisAdjacencyModule } from "./adjacency/analysis.adjacency.module";
import { AnalysisChokepointsModule } from "./chokepoints/analysis.chokepoints.module";
import { AnalysisConnectivityModule } from "./connectivity/analysis.connectivity.module";
import { AnalysisContainmentModule } from "./containment/analysis.containment.module";
import { AnalysisEgressModule } from "./egress/analysis.egress.module";
import { AnalysisQuantityModule } from "./quantity/analysis.quantity.module";
import { AnalysisRatioModule } from "./ratio/analysis.ratio.module";
import { AnalysisRoutingModule } from "./routing/analysis.routing.module";

/**
 * One module per analysis, flat: no family segment in the path, because a family
 * is a classification and a route should not move when one is revised. The
 * portal groups them by tag instead.
 */
const ANALYSES = [
  AnalysisAdjacencyModule,
  AnalysisChokepointsModule,
  AnalysisConnectivityModule,
  AnalysisContainmentModule,
  AnalysisEgressModule,
  AnalysisQuantityModule,
  AnalysisRatioModule,
  AnalysisRoutingModule,
];

@Module({
  imports: ANALYSES,
  exports: ANALYSES,
})
export class AnalysisModule {}

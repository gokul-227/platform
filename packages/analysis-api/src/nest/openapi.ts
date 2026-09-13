import type { ApiDocumentSpec } from "@aec-craft/platform-common/nest";

import { AnalysisApiModule } from "../config/api.module";
import { AnalysisAdjacencyModule } from "../modules/adjacency/analysis.adjacency.module";
import { AnalysisChokepointsModule } from "../modules/chokepoints/analysis.chokepoints.module";
import { AnalysisConnectivityModule } from "../modules/connectivity/analysis.connectivity.module";
import { AnalysisContainmentModule } from "../modules/containment/analysis.containment.module";
import { AnalysisEgressModule } from "../modules/egress/analysis.egress.module";
import { AnalysisQuantityModule } from "../modules/quantity/analysis.quantity.module";
import { AnalysisRatioModule } from "../modules/ratio/analysis.ratio.module";
import { AnalysisRoutingModule } from "../modules/routing/analysis.routing.module";

export const analysisApiDocument: ApiDocumentSpec = {
  include: [
    AnalysisApiModule,
    AnalysisAdjacencyModule,
    AnalysisChokepointsModule,
    AnalysisConnectivityModule,
    AnalysisContainmentModule,
    AnalysisEgressModule,
    AnalysisQuantityModule,
    AnalysisRatioModule,
    AnalysisRoutingModule,
  ],
  path: "openapi-analysis",
  sourceTitle: "Analysis",
  title: "Analysis API",
  tags: [
    {
      name: "Analysis",
      description:
        "Named computations over a project's model, each a POST because the question is a body rather than a path. Every one is project-scoped, so the scope is in the path rather than in the name. Three families. **Measure** reads numbers off the model — counts, totals, ratios, densities — from Postgres, so it sees the row that was committed rather than a projection that trails it; named quantities like “net floor area” are presets over these bodies rather than routes of their own, because what counts as net floor area is a decision per jurisdiction and a decision belongs in data. **Circulation** answers movement — whether every space can be walked between, where circulation depends on a single passage, the route between two spaces, how far each space is from a way out — from the projected graph, so results trail writes by the sync lag. **Structure** checks how the model is put together: whether the spatial tree holds, which spaces share a boundary. Mostly defect checks, because a space belonging to no storey is an import that lost the relation, and every rollup downstream is silently wrong until it is fixed.",
    },
  ],
};

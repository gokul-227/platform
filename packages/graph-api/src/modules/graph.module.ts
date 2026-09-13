import { Module } from "@nestjs/common";

import { GraphBatchModule } from "./batch/graph.batch.module";
import { GraphEdgeModule } from "./edges/graph.edge.module";
import { GraphCommonModule } from "./graph.common.module";
import { GraphNodeModule } from "./nodes/graph.node.module";

/**
 * Graph domain: composes the read modules (nodes + edges) with the
 * transactional write surface (`GraphBatchModule`, `POST /graph`) and
 * re-exports the shared `GraphCommonModule` so consumers can
 * `app.get(GraphVocabularyService)` from anywhere the GraphModule is in scope.
 */
@Module({
  imports: [
    GraphCommonModule,
    GraphNodeModule,
    GraphEdgeModule,
    GraphBatchModule,
  ],
  exports: [
    GraphCommonModule,
    GraphNodeModule,
    GraphEdgeModule,
    GraphBatchModule,
  ],
})
export class GraphModule {}

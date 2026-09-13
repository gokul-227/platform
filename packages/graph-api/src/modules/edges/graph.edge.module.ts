import { Module } from "@nestjs/common";

import { GraphCommonModule } from "../graph.common.module";

import { GraphEdgeCollectionController } from "./graph.edge.collection.controller";
import { GraphEdgeController } from "./graph.edge.controller";
import { GraphEdgeService } from "./graph.edge.service";

@Module({
  imports: [GraphCommonModule],
  controllers: [GraphEdgeCollectionController, GraphEdgeController],
  providers: [GraphEdgeService],
  exports: [GraphEdgeService],
})
export class GraphEdgeModule {}

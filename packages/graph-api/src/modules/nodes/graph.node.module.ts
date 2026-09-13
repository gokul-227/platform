import { Module } from "@nestjs/common";

import { GraphCommonModule } from "../graph.common.module";

import { GraphNodeCollectionController } from "./graph.node.collection.controller";
import { GraphNodeController } from "./graph.node.controller";
import { GraphNodeService } from "./graph.node.service";

@Module({
  imports: [GraphCommonModule],
  controllers: [GraphNodeCollectionController, GraphNodeController],
  providers: [GraphNodeService],
  exports: [GraphNodeService],
})
export class GraphNodeModule {}

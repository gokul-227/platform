import { Module } from "@nestjs/common";

import { GraphEdgeBatchService } from "../edges/graph.edge.batch.service";
import { GraphCommonModule } from "../graph.common.module";
import { GraphNodeBatchService } from "../nodes/graph.node.batch.service";
import { GraphVersionModule } from "../versions/graph.version.module";

import { GraphBatchController } from "./graph.batch.controller";
import { GraphBatchService } from "./graph.batch.service";

/**
 * The transactional write surface (`POST /orgs/:orgId/graph`,
 * `POST /projects/:projectId/graph`). Owns the per-kind batch
 * services (node + edge op appliers) and the combined orchestrator; node and
 * edge modules are read-only. Pulls the shared vocabulary classifier + access
 * service from `GraphCommonModule` and the version writer from
 * `GraphVersionModule`.
 */
@Module({
  imports: [GraphCommonModule, GraphVersionModule],
  controllers: [GraphBatchController],
  providers: [GraphNodeBatchService, GraphEdgeBatchService, GraphBatchService],
  exports: [GraphBatchService],
})
export class GraphBatchModule {}

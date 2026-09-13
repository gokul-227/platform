import { Module } from "@nestjs/common";

import { GraphVersionService } from "./graph.version.service";

/**
 * Version log for the graph. No controllers: the writer is composed
 * into the node/edge service transactions, the feed is consumed by the
 * graph-projection worker.
 */
@Module({
  providers: [GraphVersionService],
  exports: [GraphVersionService],
})
export class GraphVersionModule {}

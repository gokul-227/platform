import { Module } from "@nestjs/common";

import { GraphVersionModule } from "../versions/graph.version.module";

import { GraphSyncWorker } from "./graph.sync.worker";

/**
 * Projection worker wiring. Importing both dependencies makes Nest shut the
 * worker down BEFORE the driver and the database pool (reverse-dependency
 * order), so an in-flight tick always finishes against live connections.
 *
 * Only registered when `config.graphDatabase` is set; whether the loop
 * actually starts is `syncEnabled` (the worker checks at bootstrap).
 */
@Module({
  imports: [GraphVersionModule],
  providers: [GraphSyncWorker],
  exports: [GraphSyncWorker],
})
export class GraphSyncModule {}

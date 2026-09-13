import { Module } from "@nestjs/common";

import { type Config, ConfigToken } from "../../config/config";
import { type Database, DatabaseToken } from "../../database/database.module";
import { FileCommonModule } from "../file.common.module";

import { FileIndexCollectionController } from "./file.index.collection.controller";
import { FileIndexController } from "./file.index.controller";
import { createFileIndexDeps } from "./file.index.deps";
import { type FileIndexDeps, FileIndexDepsToken } from "./file.index.seams";
import { FileIndexService } from "./file.index.service";
import { FileIndexPipelineStep } from "./file.index.step";
import { FileIndexWorker } from "./file.index.worker";

/**
 * Loaded even with no `documentIndex` configured, so the endpoints answer 503
 * with a code a client can read rather than 404, as though never built.
 */
@Module({
  imports: [FileCommonModule],
  controllers: [FileIndexController, FileIndexCollectionController],
  providers: [
    FileIndexService,
    FileIndexPipelineStep,
    FileIndexWorker,
    {
      provide: FileIndexDepsToken,
      inject: [ConfigToken, DatabaseToken],
      useFactory: (config: Config, db: Database): FileIndexDeps =>
        createFileIndexDeps(config, db),
    },
  ],
  exports: [FileIndexService, FileIndexPipelineStep],
})
export class FileIndexModule {}

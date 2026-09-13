import { Module } from "@nestjs/common";

import { ThreadCommonModule } from "../thread.common.module";

import { ThreadRunMetadataModule } from "./metadata/thread.run.metadata.module";

import { ThreadRunController } from "./thread.run.controller";
import { RunEventBus } from "./thread.run.events";
import { ThreadRunService } from "./thread.run.service";
import { ThreadRunWorker } from "./thread.run.worker";

/**
 * `ThreadRunWorker` is the in-process LangGraph executor and `RunEventBus` fans
 * its events to SSE clients. The agent's graph tools come from the host through
 * `RunGraphSourceToken`; without it agents answer from general knowledge.
 */
@Module({
  imports: [ThreadCommonModule, ThreadRunMetadataModule],
  controllers: [ThreadRunController],
  providers: [ThreadRunService, ThreadRunWorker, RunEventBus],
  exports: [ThreadRunMetadataModule, ThreadRunService],
})
export class ThreadRunModule {}

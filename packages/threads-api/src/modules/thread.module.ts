import { Module } from "@nestjs/common";
import { ThreadMessageModule } from "./messages/thread.message.module";
import { ThreadMetadataModule } from "./metadata/thread.metadata.module";
import { ThreadRunModule } from "./runs/thread.run.module";
import { ThreadCommonModule } from "./thread.common.module";
import { ThreadController } from "./thread.controller";
import { ThreadService } from "./thread.service";

/**
 * Generation is `ThreadRunWorker`'s, so a client gets a reply by creating a run.
 * The worker is dormant without `config.llm`, and runs then stay `queued` for a
 * client to finalize itself.
 */
@Module({
  imports: [
    ThreadCommonModule,
    ThreadMetadataModule,
    ThreadMessageModule,
    ThreadRunModule,
  ],
  controllers: [ThreadController],
  providers: [ThreadService],
  exports: [
    ThreadCommonModule,
    ThreadMetadataModule,
    ThreadMessageModule,
    ThreadRunModule,
    ThreadService,
  ],
})
export class ThreadModule {}

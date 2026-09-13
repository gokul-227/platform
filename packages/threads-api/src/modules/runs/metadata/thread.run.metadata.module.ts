import { Module } from "@nestjs/common";

import { ThreadCommonModule } from "../../thread.common.module";

import { ThreadRunMetadataController } from "./thread.run.metadata.controller";
import { ThreadRunMetadataService } from "./thread.run.metadata.service";

@Module({
  imports: [ThreadCommonModule],
  controllers: [ThreadRunMetadataController],
  providers: [ThreadRunMetadataService],
  exports: [ThreadRunMetadataService],
})
export class ThreadRunMetadataModule {}

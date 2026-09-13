import { Module } from "@nestjs/common";

import { ThreadCommonModule } from "../thread.common.module";

import { ThreadMetadataController } from "./thread.metadata.controller";
import { ThreadMetadataService } from "./thread.metadata.service";

@Module({
  imports: [ThreadCommonModule],
  controllers: [ThreadMetadataController],
  providers: [ThreadMetadataService],
  exports: [ThreadMetadataService],
})
export class ThreadMetadataModule {}

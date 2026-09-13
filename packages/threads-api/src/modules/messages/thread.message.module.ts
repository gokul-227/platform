import { Module } from "@nestjs/common";

import { ThreadCommonModule } from "../thread.common.module";

import { ThreadMessageController } from "./thread.message.controller";
import { ThreadMessageService } from "./thread.message.service";

@Module({
  imports: [ThreadCommonModule],
  controllers: [ThreadMessageController],
  providers: [ThreadMessageService],
  exports: [ThreadMessageService],
})
export class ThreadMessageModule {}

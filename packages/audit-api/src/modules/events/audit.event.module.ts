import { Module } from "@nestjs/common";

import { AuditEventController } from "./audit.event.controller";
import { AuditEventService } from "./audit.event.service";

@Module({
  controllers: [AuditEventController],
  providers: [AuditEventService],
  exports: [AuditEventService],
})
export class AuditEventModule {}

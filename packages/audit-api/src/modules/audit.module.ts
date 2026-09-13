import { Module } from "@nestjs/common";

import { AuditEventModule } from "./events/audit.event.module";

@Module({
  imports: [AuditEventModule],
  exports: [AuditEventModule],
})
export class AuditModule {}

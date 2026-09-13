import { Module } from "@nestjs/common";

import { AdminOrgController } from "./org.controller";

/**
 * Controllers only. `OrgService` resolves from tenancy-api's global module; importing
 * `OrgModule` would pull its controller into this document as well, because
 * `deepScanRoutes` reaches one level past an include entry.
 */
@Module({
  controllers: [AdminOrgController],
})
export class AdminOrgModule {}

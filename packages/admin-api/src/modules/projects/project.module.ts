import { Module } from "@nestjs/common";

import {
  AdminOrgProjectController,
  AdminProjectController,
} from "./project.controller";

/**
 * Controllers only. `ProjectService` resolves from tenancy-api's global module; importing
 * `ProjectModule` would pull its controller into this document as well, because
 * `deepScanRoutes` reaches one level past an include entry.
 */
@Module({
  controllers: [AdminProjectController, AdminOrgProjectController],
})
export class AdminProjectModule {}

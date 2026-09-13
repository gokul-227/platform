import { Module } from "@nestjs/common";

import { AdminUserController } from "./user.controller";

/**
 * Controllers only. `UserService` resolves from users-api's global module; importing
 * `UserModule` would pull its controller into this document as well, because
 * `deepScanRoutes` reaches one level past an include entry.
 */
@Module({
  controllers: [AdminUserController],
})
export class AdminUserModule {}

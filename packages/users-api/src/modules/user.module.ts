import { Module } from "@nestjs/common";

import { UserService } from "./user.service";

/**
 * Provides `UserService` and nothing else. The surfaces are sibling submodules
 * that import this one, plus admin-api, which injects the service from here.
 */
@Module({
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

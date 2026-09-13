import { Module } from "@nestjs/common";

import { AdminOrgMemberController } from "./org.member.controller";

/** Controllers only; `MemberService` resolves from tenancy-api's global module.
 *  See `AdminOrgModule` for why its own module is not imported. */
@Module({
  controllers: [AdminOrgMemberController],
})
export class AdminOrgMemberModule {}

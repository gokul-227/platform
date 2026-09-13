import { Module } from "@nestjs/common";

import { MemberModule } from "../../members/member.module";
import { OrgMemberController } from "./org.member.controller";

@Module({
  imports: [MemberModule],
  controllers: [OrgMemberController],
})
export class OrgMemberModule {}

import { Module } from "@nestjs/common";

import { MemberModule } from "../../members/member.module";
import { ProjectMemberController } from "./project.member.controller";

@Module({
  imports: [MemberModule],
  controllers: [ProjectMemberController],
})
export class ProjectMemberModule {}

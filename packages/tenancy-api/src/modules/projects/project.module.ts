import { Module } from "@nestjs/common";
import { ProjectMemberModule } from "./members/project.member.module";
import { ProjectMetadataModule } from "./metadata/project.metadata.module";
import { OrgProjectController, ProjectController } from "./project.controller";
import { ProjectService } from "./project.service";

@Module({
  imports: [ProjectMetadataModule, ProjectMemberModule],
  controllers: [ProjectController, OrgProjectController],
  providers: [ProjectService],
  exports: [ProjectService, ProjectMetadataModule, ProjectMemberModule],
})
export class ProjectModule {}

import { Module } from "@nestjs/common";
import { OrgMemberModule } from "./members/org.member.module";
import { OrgMetadataModule } from "./metadata/org.metadata.module";
import { OrgController } from "./org.controller";
import { OrgService } from "./org.service";

@Module({
  imports: [OrgMetadataModule, OrgMemberModule],
  controllers: [OrgController],
  providers: [OrgService],
  exports: [OrgService, OrgMetadataModule, OrgMemberModule],
})
export class OrgModule {}

import { Module } from "@nestjs/common";

import { OrgMetadataController } from "./org.metadata.controller";
import { OrgMetadataService } from "./org.metadata.service";

@Module({
  controllers: [OrgMetadataController],
  providers: [OrgMetadataService],
  exports: [OrgMetadataService],
})
export class OrgMetadataModule {}

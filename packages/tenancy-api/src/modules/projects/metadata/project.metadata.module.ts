import { Module } from "@nestjs/common";

import { ProjectMetadataController } from "./project.metadata.controller";
import { ProjectMetadataService } from "./project.metadata.service";

@Module({
  controllers: [ProjectMetadataController],
  providers: [ProjectMetadataService],
  exports: [ProjectMetadataService],
})
export class ProjectMetadataModule {}

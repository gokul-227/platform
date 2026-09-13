import { Module } from "@nestjs/common";

import { MeMetadataController } from "./me.metadata.controller";
import { MeMetadataService } from "./me.metadata.service";

/**
 * Self metadata KV submodule (`/me/metadata/*`), split from `UserModule` (see
 * `OrgMetadataModule`). `DatabaseToken` is global, so no imports are needed.
 */
@Module({
  controllers: [MeMetadataController],
  providers: [MeMetadataService],
  exports: [MeMetadataService],
})
export class MeMetadataModule {}

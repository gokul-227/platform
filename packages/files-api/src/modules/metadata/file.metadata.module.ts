import { AuditWriter } from "@aec-craft/platform-audit-api";
import { Module } from "@nestjs/common";

import { FileCommonModule } from "../file.common.module";

import { FileMetadataController } from "./file.metadata.controller";
import { FileMetadataService } from "./file.metadata.service";

/**
 * File metadata KV submodule, split from `FileModule` to keep the routes + their
 * lock-and-merge service off the file CRUD. Mirrors `OrgMetadataModule`.
 */
@Module({
  imports: [FileCommonModule],
  controllers: [FileMetadataController],
  providers: [FileMetadataService, AuditWriter],
  exports: [FileMetadataService],
})
export class FileMetadataModule {}

import { AuditWriter } from "@aec-craft/platform-audit-api";
import { Module } from "@nestjs/common";
import { FileCollectionController } from "./file.collection.controller";
import { FileCommonModule } from "./file.common.module";
import { FileController } from "./file.controller";
import { type FilePipelineStep, FilePipelineStepsToken } from "./file.pipeline";
import { FileService } from "./file.service";
import { FileUploadSweeper } from "./file.upload.sweeper";
import { FileIndexModule } from "./index/file.index.module";
import { FileIndexPipelineStep } from "./index/file.index.step";
import { FileMetadataModule } from "./metadata/file.metadata.module";

/**
 * Files domain: the tree, uploads, and the document index composed onto it.
 *
 * The index is imported rather than sibling-composed because a completed upload
 * dispatches whatever its preset's pipeline named, so `FileService` needs the
 * index and not the other way round. Both take storage and the guard from
 * `FileCommonModule`.
 */
@Module({
  imports: [FileCommonModule, FileIndexModule, FileMetadataModule],
  controllers: [FileCollectionController, FileController],
  providers: [
    FileService,
    AuditWriter,
    FileUploadSweeper,
    // The only place that knows which steps are mounted. A new step module adds
    // one entry here and nothing else changes: not the upload path, not routing.
    {
      provide: FilePipelineStepsToken,
      inject: [FileIndexPipelineStep],
      useFactory: (index: FileIndexPipelineStep): FilePipelineStep[] => [index],
    },
  ],
  exports: [FileService, FileCommonModule, FileIndexModule, FileMetadataModule],
})
export class FileModule {}

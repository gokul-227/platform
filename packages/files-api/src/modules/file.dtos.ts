import {
  completeFileInputSchema,
  createFileInputSchema,
  createFileResponseSchema,
  downloadFileResponseSchema,
  fileListQuerySchema,
  fileListResponseSchema,
  fileResponseSchema,
  scopeQuerySchema,
  updateFileInputSchema,
  uploadPresetsResponseSchema,
  uploadSessionResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class CompleteFileDto extends createZodDto(completeFileInputSchema) {}

export class CreateFileDto extends createZodDto(createFileInputSchema) {}

export class CreateFileResponseDto extends createZodDto(
  createFileResponseSchema
) {}

export class DownloadFileResponseDto extends createZodDto(
  downloadFileResponseSchema
) {}

export class ListFilesDto extends createZodDto(fileListQuerySchema) {}

/** The scope a create lands in: exactly one of `orgId` or `projectId`. */
export class FileScopeQueryDto extends createZodDto(scopeQuerySchema) {}

export class FileListResponseDto extends createZodDto(fileListResponseSchema) {}

export class FileResponseDto extends createZodDto(fileResponseSchema) {}

export class UpdateFileDto extends createZodDto(updateFileInputSchema) {}

export class UploadPresetsResponseDto extends createZodDto(
  uploadPresetsResponseSchema
) {}

export class UploadSessionResponseDto extends createZodDto(
  uploadSessionResponseSchema
) {}

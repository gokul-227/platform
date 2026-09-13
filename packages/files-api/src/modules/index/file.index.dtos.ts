import {
  askFilesInputSchema,
  askFilesResponseSchema,
  contextFilesResponseSchema,
  fileIndexResponseSchema,
  indexFileInputSchema,
  retrieveFilesInputSchema,
  retrieveFilesResponseSchema,
  searchFilesInputSchema,
  searchFilesResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class AskFilesDto extends createZodDto(askFilesInputSchema) {}

export class AskFilesResponseDto extends createZodDto(askFilesResponseSchema) {}

export class ContextFilesResponseDto extends createZodDto(
  contextFilesResponseSchema
) {}

export class FileIndexResponseDto extends createZodDto(
  fileIndexResponseSchema
) {}

export class IndexFileDto extends createZodDto(indexFileInputSchema) {}

export class RetrieveFilesDto extends createZodDto(retrieveFilesInputSchema) {}

export class RetrieveFilesResponseDto extends createZodDto(
  retrieveFilesResponseSchema
) {}

export class SearchFilesDto extends createZodDto(searchFilesInputSchema) {}

export class SearchFilesResponseDto extends createZodDto(
  searchFilesResponseSchema
) {}

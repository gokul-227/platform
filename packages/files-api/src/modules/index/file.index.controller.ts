import {
  CurrentScope,
  RequireRowPermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type {
  FileIndexResponse,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { FileErrors } from "../file.errors";
import { FILE_ROW } from "../file.row";
import { FileIndexResponseDto, IndexFileDto } from "./file.index.dtos";
import { FileIndexErrors } from "./file.index.errors";
import { FileIndexService } from "./file.index.service";

/**
 * One file's relationship with the document index, addressed by the file's own
 * id. Searching is a collection operation and lives on the nested routes.
 *
 * Flat for the same reason `/files/:fileId` is: the scope is read off the row by
 * `FILE_ROW`, so a file that moves between groups does not change
 * its URL.
 */
@ApiTags("File index")
@Controller("files/:fileId/index")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  FileErrors.NOT_FOUND,
  InternalErrors.UNEXPECTED
)
export class FileIndexController {
  constructor(
    @Inject(FileIndexService) private readonly index: FileIndexService
  ) {}

  @Get()
  @ApiPathParams("fileId")
  @RequireRowPermit("read", FILE_ROW)
  @ApiOperation({
    summary: "Get a file's index state",
    description:
      "**Requires `read` on the file.** Where this file stands in the document index. " +
      "A file that was never submitted has no index state.",
  })
  @ApiResponse({ status: 200, type: FileIndexResponseDto })
  @ApiPlatformErrors(FileIndexErrors.NOT_INDEXED)
  getState(
    @CurrentScope() scope: ResolvedScope,
    @Param("fileId") fileId: string
  ): Promise<FileIndexResponse> {
    return this.index.getState(scope, fileId);
  }

  @Post()
  @ApiPathParams("fileId")
  @RequireRowPermit("write", FILE_ROW)
  @ApiOperation({
    summary: "Submit a file for indexing",
    description:
      "**Requires `write` on the file.** Queues the file: its text is extracted, chunked, embedded and " +
      "made searchable by a worker. Returns as soon as the intent is recorded, with `status: 'pending'`. " +
      "Submitting an already-indexed file re-extracts it and replaces its chunks, which is what to call " +
      "after the file's bytes were replaced. Uploads under a preset whose pipeline includes `index` are " +
      "submitted automatically and need no call here.",
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse({ status: 202, type: FileIndexResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    FileErrors.NOT_A_FILE,
    FileIndexErrors.NOT_CONFIGURED,
    FileIndexErrors.NOT_READY,
    FileIndexErrors.UNSUPPORTED_CONTENT_TYPE
  )
  submit(
    @CurrentScope() scope: ResolvedScope,
    @Param("fileId") fileId: string,
    @Body() dto: IndexFileDto
  ): Promise<FileIndexResponse> {
    return this.index.submit(scope, fileId, dto);
  }

  @Delete()
  @ApiPathParams("fileId")
  @RequireRowPermit("write", FILE_ROW)
  @ApiOperation({
    summary: "Remove a file from the index",
    description:
      "**Requires `write` on the file.** Drops the file's chunks and its extracted text. The file itself, " +
      "and its bytes, are untouched: this makes a document unsearchable without deleting it.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "De-indexed" })
  async remove(
    @CurrentScope() scope: ResolvedScope,
    @Param("fileId") fileId: string
  ): Promise<void> {
    await this.index.remove(scope, fileId);
  }

  @Get("text")
  @ApiPathParams("fileId")
  @RequireRowPermit("read", FILE_ROW)
  @ApiOperation({
    summary: "Get a file's extracted text",
    description:
      "**Requires `read` on the file.** The markdown the index actually searches, which is what to read " +
      "when a retrieval result looks wrong: it shows what the extractor made of the document. " +
      "Page boundaries are preserved as `<!-- page:N -->` markers.",
  })
  @ApiResponse({
    status: 200,
    description: "The extracted markdown",
    schema: { type: "string" },
  })
  @ApiPlatformErrors(FileIndexErrors.NOT_INDEXED)
  getText(
    @CurrentScope() scope: ResolvedScope,
    @Param("fileId") fileId: string
  ): Promise<string> {
    return this.index.getText(scope, fileId);
  }
}

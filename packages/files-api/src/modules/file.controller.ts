import {
  AuthorizationService,
  CurrentScope,
  RequireRowPermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type { ResolvedScope } from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  type DownloadFileResponse,
  type FileResponse,
  InternalErrors,
  type UploadPresetsResponse,
  type UploadSessionResponse,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  CompleteFileDto,
  DownloadFileResponseDto,
  FileResponseDto,
  UpdateFileDto,
  UploadPresetsResponseDto,
  UploadSessionResponseDto,
} from "./file.dtos";
import { FileErrors } from "./file.errors";
import { FILE_ROW } from "./file.row";
import { FileService } from "./file.service";

/**
 * Flat on purpose: a row's group is a column rather than its partition, and a
 * file can move between groups, which a nested by-id URL would contradict or
 * invalidate. `@RequireRowPermit` reads the scope off the row instead.
 */
@ApiTags("Files")
@Controller("files")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class FileController {
  constructor(
    @Inject(FileService) private readonly files: FileService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  // Declared before `:fileId` so the static segment wins the match.
  @Get("presets")
  @ApiOperation({
    summary: "List the upload presets",
    description:
      "What this deployment accepts on upload — a named configuration per purpose, `default` among them — so a client can reject a file before it starts sending bytes. " +
      "Deployment config, not scoped data: any authenticated principal may read it.",
  })
  @ApiResponse({ status: 200, type: UploadPresetsResponseDto })
  presets(): UploadPresetsResponse {
    return this.files.presets();
  }

  @Get(":fileId")
  @ApiPathParams("fileId")
  @RequireRowPermit("read", FILE_ROW)
  @ApiOperation({ summary: "Get a file or folder" })
  @ApiResponse({ status: 200, type: FileResponseDto })
  @ApiPlatformErrors(FileErrors.NOT_FOUND)
  findById(
    @CurrentScope() scope: ResolvedScope,
    @Param("fileId") fileId: string
  ): Promise<FileResponse> {
    return this.files.findById(scope, fileId);
  }

  @Patch(":fileId")
  @ApiPathParams("fileId")
  @RequireRowPermit("write", FILE_ROW)
  @ApiOperation({
    summary: "Rename or move a file/folder",
    description:
      "**Requires `write` on the file.** Content is immutable; re-upload to replace bytes.",
  })
  @ApiResponse({ status: 200, type: FileResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    FileErrors.NOT_FOUND,
    FileErrors.PARENT_NOT_FOUND,
    FileErrors.PARENT_NOT_FOLDER,
    FileErrors.PARENT_CROSS_SCOPE,
    FileErrors.PARENT_CYCLE,
    FileErrors.NAME_CONFLICT
  )
  async update(
    @CurrentPrincipal() principal: Principal,
    @CurrentScope() scope: ResolvedScope,
    @Param("fileId") fileId: string,
    @Body() dto: UpdateFileDto
  ): Promise<FileResponse> {
    // The guard covered the group the file is leaving. This covers the one it
    // joins: without it, `write` on your own folder would be enough to push a
    // row into a group you hold nothing on.
    if (dto.groupId !== undefined) {
      await this.checks.assertCan(principal, "write", dto.groupId);
    }
    return await this.files.update(scope, fileId, dto, principal);
  }

  @Delete(":fileId")
  @ApiPathParams("fileId")
  @RequireRowPermit("write", FILE_ROW)
  @ApiOperation({
    summary: "Delete a file or folder",
    description:
      "**Requires `write` on the file.** Deleting a folder removes its whole subtree and the bucket objects.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "Deleted" })
  @ApiPlatformErrors(FileErrors.NOT_FOUND)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @CurrentScope() scope: ResolvedScope,
    @Param("fileId") fileId: string
  ): Promise<void> {
    await this.files.delete(scope, fileId, principal);
  }

  @Post(":fileId/complete")
  @ApiPathParams("fileId")
  @RequireRowPermit("write", FILE_ROW)
  @ApiOperation({
    summary: "Confirm a pending upload",
    description:
      "**Requires `write` on the file.** Call once the bytes are in the bucket. The server verifies the object " +
      "exists and matches the declared size, then flips the file to `ready`. Exactly one call can succeed; " +
      "a call that arrives before the last bytes is refused and can be retried.",
  })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: FileResponseDto })
  @ApiPlatformErrors(
    FileErrors.NOT_FOUND,
    FileErrors.NOT_A_FILE,
    FileErrors.NOT_PENDING,
    FileErrors.UPLOAD_NOT_FOUND,
    FileErrors.UPLOAD_SESSION_NOT_FOUND,
    FileErrors.UPLOAD_SIZE_MISMATCH,
    FileErrors.STORAGE_UNAVAILABLE
  )
  complete(
    @CurrentPrincipal() principal: Principal,
    @CurrentScope() scope: ResolvedScope,
    @Param("fileId") fileId: string,
    @Body() dto: CompleteFileDto
  ): Promise<FileResponse> {
    return this.files.complete(scope, fileId, dto, principal);
  }

  @Get(":fileId/upload")
  @ApiPathParams("fileId")
  @RequireRowPermit("write", FILE_ROW)
  @ApiOperation({
    summary: "Get the live upload session",
    description:
      "**Requires `write` on the file.** Resumes an unfinished upload: a `put` ticket comes back freshly signed, " +
      "a `resumable` ticket points at the same session, so the client probes the committed offset at the bucket " +
      "and continues from there. This is what survives a pause, a dropped connection, or a page reload.",
  })
  @ApiResponse({ status: 200, type: UploadSessionResponseDto })
  @ApiPlatformErrors(
    FileErrors.NOT_FOUND,
    FileErrors.NOT_A_FILE,
    FileErrors.NOT_PENDING,
    FileErrors.UPLOAD_SESSION_NOT_FOUND,
    FileErrors.UPLOAD_EXPIRED,
    FileErrors.STORAGE_UNAVAILABLE
  )
  resumeUpload(
    @CurrentScope() scope: ResolvedScope,
    @Param("fileId") fileId: string
  ): Promise<UploadSessionResponse> {
    return this.files.resumeUpload(scope, fileId);
  }

  @Post(":fileId/abort")
  @ApiPathParams("fileId")
  @RequireRowPermit("write", FILE_ROW)
  @ApiOperation({
    summary: "Abandon a pending upload",
    description:
      "**Requires `write` on the file.** Cancels the upload session, drops whatever bytes landed, and removes the " +
      "pending row — the caller taking back its own unfinished upload.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "Aborted" })
  @ApiPlatformErrors(
    FileErrors.NOT_FOUND,
    FileErrors.NOT_A_FILE,
    FileErrors.NOT_PENDING
  )
  async abortUpload(
    @CurrentScope() scope: ResolvedScope,
    @Param("fileId") fileId: string
  ): Promise<void> {
    await this.files.abortUpload(scope, fileId);
  }

  @Get(":fileId/download")
  @ApiPathParams("fileId")
  @RequireRowPermit("read", FILE_ROW)
  @ApiOperation({
    summary: "Get a signed download URL",
    description:
      "**Requires `read` on the file.** Returns a short-lived URL to fetch the bytes.",
  })
  @ApiResponse({ status: 200, type: DownloadFileResponseDto })
  @ApiPlatformErrors(
    FileErrors.NOT_FOUND,
    FileErrors.NOT_A_FILE,
    FileErrors.NOT_READY,
    FileErrors.STORAGE_UNAVAILABLE
  )
  download(
    @CurrentPrincipal() principal: Principal,
    @CurrentScope() scope: ResolvedScope,
    @Param("fileId") fileId: string
  ): Promise<DownloadFileResponse> {
    return this.files.download(scope, fileId, principal);
  }
}

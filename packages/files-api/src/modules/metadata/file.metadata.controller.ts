import {
  CurrentScope,
  RequireRowPermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type {
  FileResponse,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import { SetMetadataDto } from "@aec-craft/platform-metadata";
import { Body, Controller, Delete, Inject, Param, Put } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { FileResponseDto } from "../file.dtos";
import { FileErrors } from "../file.errors";
import { FILE_ROW } from "../file.row";
import { FileMetadataService } from "./file.metadata.service";

/**
 * The only path to the bag after create: `PATCH /files/:fileId` cannot touch it.
 * Each write is its own audit event, naming the key rather than diffing the bag.
 */
@ApiTags("Files")
@Controller("files")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class FileMetadataController {
  constructor(
    @Inject(FileMetadataService)
    private readonly metadata: FileMetadataService
  ) {}

  @Put(":fileId/metadata/:keyPath")
  @ApiPathParams("fileId", "keyPath")
  @RequireRowPermit("write", FILE_ROW)
  @ApiOperation({
    summary: "Set a file metadata key",
    description:
      "**Requires `write` on the file.** Merge-write a single key into the file or folder's metadata bag. The value at the dotted key path is replaced; sibling keys are preserved. Missing parents are created. The bag is free-form and stored as-is; no key schema is enforced. Apps namespace their settings under `apps.<appId>.*` to avoid collisions. The server-managed `content` descriptor is never client-writable.",
  })
  @ApiResponse({ status: 200, type: FileResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, FileErrors.NOT_FOUND)
  set(
    @CurrentScope() scope: ResolvedScope,
    @CurrentPrincipal() principal: Principal,
    @Param("fileId") fileId: string,
    @Param("keyPath") keyPath: string,
    @Body() dto: SetMetadataDto
  ): Promise<FileResponse> {
    return this.metadata.set(scope, fileId, keyPath, dto.value, principal);
  }

  @Delete(":fileId/metadata/:keyPath")
  @ApiPathParams("fileId", "keyPath")
  @RequireRowPermit("write", FILE_ROW)
  @ApiOperation({
    summary: "Delete a file metadata key",
    description:
      "**Requires `write` on the file.** Remove a single key from the file or folder's metadata bag. Deleting a key that doesn't exist is a no-op.",
  })
  @ApiResponse({ status: 200, type: FileResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, FileErrors.NOT_FOUND)
  delete(
    @CurrentScope() scope: ResolvedScope,
    @CurrentPrincipal() principal: Principal,
    @Param("fileId") fileId: string,
    @Param("keyPath") keyPath: string
  ): Promise<FileResponse> {
    return this.metadata.delete(scope, fileId, keyPath, principal);
  }
}

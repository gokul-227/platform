import {
  CurrentScope,
  RequireRowPermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type {
  ResolvedScope,
  ThreadResponse,
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
import { ThreadResponseDto } from "../thread.dtos";
import { ThreadErrors } from "../thread.errors";
import { THREAD_ROW } from "../thread.row";
import { ThreadMetadataService } from "./thread.metadata.service";

/** The only path to the bag after create: `PATCH /threads/:threadId` cannot. */
@ApiTags("Threads")
@Controller("threads")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class ThreadMetadataController {
  constructor(
    @Inject(ThreadMetadataService)
    private readonly metadata: ThreadMetadataService
  ) {}

  @Put(":threadId/metadata/:keyPath")
  @ApiPathParams("threadId", "keyPath")
  @RequireRowPermit("write", THREAD_ROW)
  @ApiOperation({
    summary: "Set a thread metadata key",
    description:
      "**Requires `write` on the thread** and ownership. Merge-write a single key into the thread's metadata bag. The value at the dotted key path is replaced; sibling keys are preserved. Missing parents are created. The bag is free-form and stored as-is; no key schema is enforced. Apps namespace their settings under `apps.<appId>.*` to avoid collisions.",
  })
  @ApiResponse({ status: 200, type: ThreadResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, ThreadErrors.NOT_FOUND)
  set(
    @CurrentScope() scope: ResolvedScope,
    @CurrentPrincipal() principal: Principal,
    @Param("threadId") threadId: string,
    @Param("keyPath") keyPath: string,
    @Body() dto: SetMetadataDto
  ): Promise<ThreadResponse> {
    return this.metadata.set(
      scope,
      principal.subject,
      threadId,
      keyPath,
      dto.value
    );
  }

  @Delete(":threadId/metadata/:keyPath")
  @ApiPathParams("threadId", "keyPath")
  @RequireRowPermit("write", THREAD_ROW)
  @ApiOperation({
    summary: "Delete a thread metadata key",
    description:
      "**Requires `write` on the thread** and ownership. Remove a single key from the thread's metadata bag. Deleting a key that doesn't exist is a no-op.",
  })
  @ApiResponse({ status: 200, type: ThreadResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, ThreadErrors.NOT_FOUND)
  delete(
    @CurrentScope() scope: ResolvedScope,
    @CurrentPrincipal() principal: Principal,
    @Param("threadId") threadId: string,
    @Param("keyPath") keyPath: string
  ): Promise<ThreadResponse> {
    return this.metadata.delete(scope, principal.subject, threadId, keyPath);
  }
}

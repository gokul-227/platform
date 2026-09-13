import { RequireRowPermit } from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type { ThreadRunResponse } from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import { SetMetadataDto } from "@aec-craft/platform-metadata";
import { Body, Controller, Delete, Inject, Param, Put } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ThreadErrors } from "../../thread.errors";
import { THREAD_ROW } from "../../thread.row";
import { ThreadRunResponseDto } from "../thread.run.dtos";
import { ThreadRunMetadataService } from "./thread.run.metadata.service";

/** The only path to a run's bag after create. */
@ApiTags("Threads")
@Controller("threads")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class ThreadRunMetadataController {
  constructor(
    @Inject(ThreadRunMetadataService)
    private readonly metadata: ThreadRunMetadataService
  ) {}

  @Put(":threadId/runs/:runId/metadata/:keyPath")
  @ApiPathParams("threadId", "runId")
  @RequireRowPermit("write", THREAD_ROW)
  @ApiOperation({
    summary: "Set a run metadata key",
    description:
      "**Requires `write` on the thread** and ownership. Merge-write a single key into the run's metadata bag. The value at the dotted key path is replaced; sibling keys are preserved. Missing parents are created. A finished run still accepts these writes, because the bag is app data rather than lifecycle.",
  })
  @ApiResponse({ status: 200, type: ThreadRunResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, ThreadErrors.RUN_NOT_FOUND)
  set(
    @Param("threadId") threadId: string,
    @Param("runId") runId: string,
    @Param("keyPath") keyPath: string,
    @Body() dto: SetMetadataDto
  ): Promise<ThreadRunResponse> {
    return this.metadata.set(threadId, runId, keyPath, dto.value);
  }

  @Delete(":threadId/runs/:runId/metadata/:keyPath")
  @ApiPathParams("threadId", "runId")
  @RequireRowPermit("write", THREAD_ROW)
  @ApiOperation({
    summary: "Delete a run metadata key",
    description:
      "**Requires `write` on the thread** and ownership. Remove a single key from the run's metadata bag. Deleting a key that doesn't exist is a no-op.",
  })
  @ApiResponse({ status: 200, type: ThreadRunResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, ThreadErrors.RUN_NOT_FOUND)
  delete(
    @Param("threadId") threadId: string,
    @Param("runId") runId: string,
    @Param("keyPath") keyPath: string
  ): Promise<ThreadRunResponse> {
    return this.metadata.delete(threadId, runId, keyPath);
  }
}

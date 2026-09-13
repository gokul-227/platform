import {
  CurrentScope,
  RequireRowPermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiFilterQueries,
  ApiPaginationQueries,
  ApiPathParams,
  ApiPlatformErrors,
  ApiScopeAddressQueries,
} from "@aec-craft/platform-common/nest";
import type { ResolvedScope } from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  type ThreadListResponse,
  type ThreadResponse,
  threadFilters,
  threadList,
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
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  CreateThreadDto,
  ListThreadsDto,
  ThreadListResponseDto,
  ThreadResponseDto,
  UpdateThreadDto,
} from "./thread.dtos";
import { ThreadErrors } from "./thread.errors";
import { THREAD_ROW } from "./thread.row";
import { ThreadService } from "./thread.service";

/**
 * Scope rides in the body on create and the query on list; a by-id route
 * resolves it from the row. `THREAD_ROW` also names the ownership column,
 * because threads are not shared, so one you do not own reads as missing.
 */
@ApiTags("Threads")
@Controller("threads")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class ThreadController {
  constructor(@Inject(ThreadService) private readonly threads: ThreadService) {}

  @Get()
  @RequireRowPermit("read", THREAD_ROW)
  @ApiOperation({
    summary: "List threads",
    description:
      "**Requires `read` on the organization, or `read` on the project.** Provide exactly one of `orgId` or " +
      "`projectId`. Returns only the caller's own threads (threads are not shared), most-recently-updated first.",
  })
  @ApiResponse({ status: 200, type: ThreadListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiScopeAddressQueries()
  @ApiFilterQueries(threadFilters)
  @ApiPaginationQueries(threadList.pagination)
  list(
    @CurrentScope() scope: ResolvedScope,
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListThreadsDto
  ): Promise<ThreadListResponse> {
    return this.threads.list(scope, principal.subject, query);
  }

  @Get(":threadId")
  @ApiPathParams("threadId")
  @RequireRowPermit("read", THREAD_ROW)
  @ApiOperation({ summary: "Get a thread" })
  @ApiResponse({ status: 200, type: ThreadResponseDto })
  @ApiPlatformErrors(ThreadErrors.NOT_FOUND)
  findById(
    @CurrentScope() scope: ResolvedScope,
    @CurrentPrincipal() principal: Principal,
    @Param("threadId") threadId: string
  ): Promise<ThreadResponse> {
    return this.threads.findById(scope, principal.subject, threadId);
  }

  @Post()
  @RequireRowPermit("write", THREAD_ROW)
  @ApiOperation({
    summary: "Create a thread",
    description:
      "**Requires `write` on the organization, or `write` on the project.** Owner and client are stamped " +
      "from the token, never the body.",
  })
  @ApiResponse({ status: 201, type: ThreadResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  create(
    @CurrentScope() scope: ResolvedScope,
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateThreadDto
  ): Promise<ThreadResponse> {
    return this.threads.create(scope, dto, principal.subject);
  }

  @Patch(":threadId")
  @ApiPathParams("threadId")
  @RequireRowPermit("write", THREAD_ROW)
  @ApiOperation({
    summary: "Rename or retag a thread",
    description:
      "**Requires `write` on the thread** and ownership. Only the owner can rename a thread.",
  })
  @ApiResponse({ status: 200, type: ThreadResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, ThreadErrors.NOT_FOUND)
  update(
    @CurrentScope() scope: ResolvedScope,
    @CurrentPrincipal() principal: Principal,
    @Param("threadId") threadId: string,
    @Body() dto: UpdateThreadDto
  ): Promise<ThreadResponse> {
    return this.threads.update(scope, principal.subject, threadId, dto);
  }

  @Delete(":threadId")
  @ApiPathParams("threadId")
  @RequireRowPermit("write", THREAD_ROW)
  @ApiOperation({
    summary: "Delete a thread",
    description:
      "**Requires `write` on the thread** and ownership, since `write` covers update and delete alike. Only the owner can delete a thread, regardless " +
      "of role. Cascades the thread's messages and runs.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "Deleted" })
  @ApiPlatformErrors(ThreadErrors.NOT_FOUND)
  async remove(
    @CurrentScope() scope: ResolvedScope,
    @CurrentPrincipal() principal: Principal,
    @Param("threadId") threadId: string
  ): Promise<void> {
    await this.threads.delete(scope, principal.subject, threadId);
  }
}

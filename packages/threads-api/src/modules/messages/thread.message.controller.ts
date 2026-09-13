import { RequireRowPermit } from "@aec-craft/platform-authorization/nest";
import {
  ApiFilterQueries,
  ApiPaginationQueries,
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  type ThreadMessageListResponse,
  type ThreadMessageResponse,
  threadMessageFilters,
  threadMessageList,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ThreadErrors } from "../thread.errors";
import { THREAD_ROW } from "../thread.row";
import {
  CreateThreadMessageDto,
  ListThreadMessagesDto,
  ThreadMessageListResponseDto,
  ThreadMessageResponseDto,
} from "./thread.message.dtos";
import { ThreadMessageService } from "./thread.message.service";

/**
 * Append and list only, both authorized through the parent thread. Listing is
 * oldest-first, the reading order.
 */
@ApiTags("Thread messages")
@Controller("threads/:threadId/messages")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  ThreadErrors.NOT_FOUND,
  InternalErrors.UNEXPECTED
)
export class ThreadMessageController {
  constructor(
    @Inject(ThreadMessageService)
    private readonly messages: ThreadMessageService
  ) {}

  @Get()
  @ApiPathParams("threadId")
  @RequireRowPermit("read", THREAD_ROW)
  @ApiOperation({
    summary: "List a thread's messages",
    description:
      "**Requires `read` on the thread** and ownership. Oldest-first.",
  })
  @ApiResponse({ status: 200, type: ThreadMessageListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(threadMessageFilters)
  @ApiPaginationQueries(threadMessageList.pagination)
  list(
    @Param("threadId") threadId: string,
    @Query() query: ListThreadMessagesDto
  ): Promise<ThreadMessageListResponse> {
    return this.messages.list(threadId, query);
  }

  @Post()
  @ApiPathParams("threadId")
  @RequireRowPermit("write", THREAD_ROW)
  @ApiOperation({
    summary: "Append a message",
    description:
      "**Requires `write` on the thread** and ownership. Append-only; messages are never edited or " +
      "deleted. Assistant messages are normally written by completing a run, not here.",
  })
  @ApiResponse({ status: 201, type: ThreadMessageResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  create(
    @Param("threadId") threadId: string,
    @Body() dto: CreateThreadMessageDto
  ): Promise<ThreadMessageResponse> {
    return this.messages.create(threadId, dto);
  }
}

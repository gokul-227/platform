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
  type ThreadRunListResponse,
  type ThreadRunResponse,
  type ThreadRunStreamEvent,
  threadRunFilters,
  threadRunList,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  type MessageEvent,
  Param,
  Post,
  Query,
  Sse,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Observable } from "rxjs";
import { ThreadErrors } from "../thread.errors";
import { THREAD_ROW } from "../thread.row";
import {
  CreateThreadRunDto,
  ListThreadRunsDto,
  SubmitThreadRunDto,
  ThreadRunListResponseDto,
  ThreadRunResponseDto,
} from "./thread.run.dtos";
import { RunEventBus } from "./thread.run.events";
import { ThreadRunService } from "./thread.run.service";

/** Statuses where generation is over (or parked): no more live events will come. */
const SETTLED_STATUSES = ["complete", "failed", "cancelled", "requires_action"];

/** The events to replay for a run that already settled before the client connected. */
function settledEvents(run: ThreadRunResponse): ThreadRunStreamEvent[] {
  const events: ThreadRunStreamEvent[] = [];
  if (run.status === "requires_action" && run.action) {
    events.push({ type: "action", action: run.action });
  }
  if (run.status === "failed" && run.error) {
    events.push({ type: "error", error: run.error });
  }
  events.push({ type: "done", status: run.status });
  return events;
}

/**
 * The run is the unit a client observes, by polling or over SSE. The executor
 * finalizes it server-side; a client may only cancel an in-flight run or submit
 * an answer to a parked one. Every route authorizes through the parent thread.
 */
@ApiTags("Thread runs")
@Controller("threads/:threadId/runs")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  ThreadErrors.NOT_FOUND,
  InternalErrors.UNEXPECTED
)
export class ThreadRunController {
  constructor(
    @Inject(ThreadRunService) private readonly runs: ThreadRunService,
    @Inject(RunEventBus) private readonly events: RunEventBus
  ) {}

  @Get()
  @ApiPathParams("threadId")
  @RequireRowPermit("read", THREAD_ROW)
  @ApiOperation({
    summary: "List a thread's runs",
    description:
      "**Requires `read` on the thread** and ownership. Most-recent-first.",
  })
  @ApiResponse({ status: 200, type: ThreadRunListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(threadRunFilters)
  @ApiPaginationQueries(threadRunList.pagination)
  list(
    @Param("threadId") threadId: string,
    @Query() query: ListThreadRunsDto
  ): Promise<ThreadRunListResponse> {
    return this.runs.list(threadId, query);
  }

  @Post()
  @ApiPathParams("threadId")
  @RequireRowPermit("write", THREAD_ROW)
  @ApiOperation({
    summary: "Start a run",
    description:
      "**Requires `write` on the thread** and ownership. Creates a `queued` run; the executor then " +
      "generates and finalizes it. An inline `agent` config (prompt + tier + MCP tools) is optional. " +
      "Owner/client are stamped from the token.",
  })
  @ApiResponse({ status: 201, type: ThreadRunResponseDto })
  create(
    @CurrentPrincipal() principal: Principal,
    @Param("threadId") threadId: string,
    @Body() dto: CreateThreadRunDto
  ): Promise<ThreadRunResponse> {
    return this.runs.create(
      threadId,
      principal.subject,
      dto.tier ?? null,
      dto.agent ?? null,
      dto.metadata ?? null
    );
  }

  @Get(":runId")
  @ApiPathParams("threadId", "runId")
  @RequireRowPermit("read", THREAD_ROW)
  @ApiOperation({ summary: "Get a run (poll for completion)" })
  @ApiResponse({ status: 200, type: ThreadRunResponseDto })
  @ApiPlatformErrors(ThreadErrors.RUN_NOT_FOUND)
  findById(
    @Param("threadId") threadId: string,
    @Param("runId") runId: string
  ): Promise<ThreadRunResponse> {
    return this.runs.findById(threadId, runId);
  }

  @Post(":runId/cancel")
  @ApiPathParams("threadId", "runId")
  @RequireRowPermit("write", THREAD_ROW)
  @ApiOperation({
    summary: "Cancel a run",
    description:
      "**Requires `write` on the thread** and ownership. Pending/streaming runs only.",
  })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: ThreadRunResponseDto })
  @ApiPlatformErrors(ThreadErrors.RUN_NOT_FOUND, ThreadErrors.RUN_NOT_PENDING)
  cancel(
    @Param("threadId") threadId: string,
    @Param("runId") runId: string
  ): Promise<ThreadRunResponse> {
    return this.runs.cancel(threadId, runId);
  }

  @Sse(":runId/stream")
  @ApiPathParams("threadId", "runId")
  @RequireRowPermit("read", THREAD_ROW)
  @ApiOperation({
    summary: "Stream a run (SSE)",
    description:
      "**Requires `read` on the thread** and ownership. Server-sent `ThreadRunStreamEvent`s: `token` (incremental " +
      "answer), `tool` (name only — no Cypher), then `message` / `action` / `error`, closed by `done`. " +
      "A run that already settled replays its outcome. Live events are process-local to the executing " +
      "instance (single-instance deploy).",
  })
  @ApiResponse({
    status: 200,
    description: "text/event-stream of ThreadRunStreamEvent.",
  })
  @ApiPlatformErrors(ThreadErrors.RUN_NOT_FOUND)
  async stream(
    @Param("threadId") threadId: string,
    @Param("runId") runId: string
  ): Promise<Observable<MessageEvent>> {
    await this.runs.findById(threadId, runId); // 404 early if the run doesn't exist

    return new Observable<MessageEvent>((subscriber) => {
      // Subscribe before re-reading the status, so an event emitted in between
      // is buffered rather than missed.
      const sub = this.events.subscribe(runId);
      let active = true;
      void (async () => {
        try {
          const current = await this.runs.findById(threadId, runId);
          if (SETTLED_STATUSES.includes(current.status)) {
            sub.close();
            for (const event of settledEvents(current)) {
              subscriber.next({ data: event });
            }
            subscriber.complete();
            return;
          }
          for await (const event of sub) {
            if (!active) {
              break;
            }
            subscriber.next({ data: event });
            if (event.type === "done") {
              break;
            }
          }
          subscriber.complete();
        } catch (err) {
          sub.close();
          subscriber.error(err);
        }
      })();
      return () => {
        active = false;
        sub.close();
      };
    });
  }

  @Post(":runId/submit")
  @ApiPathParams("threadId", "runId")
  @RequireRowPermit("write", THREAD_ROW)
  @ApiOperation({
    summary: "Answer a run that is waiting on input",
    description:
      "**Requires `write` on the thread** and ownership. Feeds the user's answer to a `requires_action` " +
      "run and resumes generation; the run returns to `queued` and may pause again.",
  })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: ThreadRunResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    ThreadErrors.RUN_NOT_FOUND,
    ThreadErrors.RUN_NOT_AWAITING_INPUT
  )
  submit(
    @Param("threadId") threadId: string,
    @Param("runId") runId: string,
    @Body() dto: SubmitThreadRunDto
  ): Promise<ThreadRunResponse> {
    return this.runs.submit(threadId, runId, dto);
  }
}

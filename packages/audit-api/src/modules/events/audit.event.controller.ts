import {
  AuthorizationService,
  RequirePermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiFilterQueries,
  ApiPaginationQueries,
  ApiPathParams,
  ApiPlatformErrors,
  ApiScopeQueries,
} from "@aec-craft/platform-common/nest";
import {
  type AuditEventListResponse,
  type AuditEventResponse,
  AuthenticationErrors,
  AuthorizationErrors,
  auditEventFilters,
  auditEventList,
  InternalErrors,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  AuditEventListResponseDto,
  AuditEventResponseDto,
  GetAuditEventDto,
  ListAuditEventsDto,
} from "./audit.event.dtos";
import { AuditEventErrors } from "./audit.event.errors";
import { AuditEventService } from "./audit.event.service";

/**
 * One feed, addressed by scope: an organization's events (its own rows, its
 * groups and memberships, and its projects being created or deleted) or one
 * project's.
 *
 * The scope is a parameter rather than a path segment because an event carries
 * `org_id` and `project_id` as columns: the feed is one table either way, and
 * the scope is a predicate on it.
 */
@ApiTags("Audit events")
@Controller("audit/events")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class AuditEventController {
  constructor(
    @Inject(AuditEventService) private readonly audit: AuditEventService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Get()
  @ApiOperation({
    summary: "List audit events",
    description:
      "**Requires `read` on the organization or project named.** Name exactly one of `orgId` or `projectId`; an organization's feed includes its projects. Newest first by default. Filter by actor, resource, verb, request id, or created-at range; cursor-paginated.",
  })
  @RequirePermit("read")
  @ApiScopeQueries()
  @ApiResponse({ status: 200, type: AuditEventListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiPaginationQueries(auditEventList.pagination)
  @ApiFilterQueries(auditEventFilters)
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListAuditEventsDto
  ): Promise<AuditEventListResponse> {
    const scope = scopeColumns(query);
    return await this.audit.list(
      query,
      scope,
      await this.checks.readableGroups(principal, scope)
    );
  }

  @Get(":eventId")
  @ApiPathParams("eventId")
  @ApiOperation({
    summary: "Get an audit event",
    description:
      "**Requires `read` on the organization or project named.** One event by id, within the scope named. One outside it is absent rather than refused.",
  })
  @RequirePermit("read")
  @ApiScopeQueries()
  @ApiResponse({ status: 200, type: AuditEventResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, AuditEventErrors.NOT_FOUND)
  findById(
    @Param("eventId") eventId: string,
    @Query() query: GetAuditEventDto
  ): Promise<AuditEventResponse> {
    return this.audit.findById(eventId, scopeColumns(query));
  }
}

/** The scope pair as the service's `{ orgId?, projectId? }` filter. */
function scopeColumns(query: {
  orgId?: string | undefined;
  projectId?: string | undefined;
}): { orgId?: string; projectId?: string } {
  return query.projectId
    ? { projectId: query.projectId }
    : { orgId: query.orgId as string };
}

import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
import { ApiPlatformErrors } from "@aec-craft/platform-common/nest";
import type { CallerStandingListResponse } from "@aec-craft/platform-contracts";
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

import { Controller, Get, Inject, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  CallerStandingListResponseDto,
  ListCallerStandingsDto,
} from "./me.group.dtos";

/**
 * Resolved as permits rather than as membership rows: a standing reaches a
 * partition down the parent chain, so a surface keyed on "is there a row for me
 * here" would hide controls its user is entitled to.
 */
@ApiTags("Me")
@Controller("me/groups")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.UNAVAILABLE,
  ValidationErrors.FAILED,
  InternalErrors.UNEXPECTED
)
export class MeGroupController {
  constructor(
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService
  ) {}

  @Get()
  @ApiQuery({
    name: "orgId",
    required: false,
    format: "uuid",
    type: String,
    description:
      "Narrow to one organization. Omit for every organization you reach.",
  })
  @ApiOperation({
    summary: "List my standings",
    description:
      "Every partition this caller may read, with their own standing on it (null when they reach it from above) and every permit resolved. Name `orgId` to narrow to one organization; omitting it answers across every organization they reach, which is the call a client makes before it holds any id. An empty list means they hold nothing anywhere, which is not an error.",
  })
  @ApiResponse({ status: 200, type: CallerStandingListResponseDto })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListCallerStandingsDto
  ): Promise<CallerStandingListResponse> {
    return {
      items: await this.authorization.standingsOf(principal, query.orgId),
    };
  }
}

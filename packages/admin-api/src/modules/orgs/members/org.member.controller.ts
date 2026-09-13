import {
  AuthorizationService,
  StaffGuard,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  type MemberListResponse,
  type MemberResponse,
  ValidationErrors,
} from "@aec-craft/platform-contracts";

import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import { MemberErrors, OrgErrors } from "@aec-craft/platform-tenancy-api";
import { MemberService } from "@aec-craft/platform-tenancy-api/nest";
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
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  CreateMemberDto,
  ListMembersDto,
  MemberListResponseDto,
  MemberResponseDto,
  UpdateMemberDto,
} from "./member.dtos";

/** Every write here passes `staff`, which is what lifts the escalation
 *  ceiling — see `MemberService.assertMayGrant`. */
const AS_STAFF = { type: "staff" } as const;

/**
 * A tenant's roster, administered from outside it.
 *
 * The customer's own `/orgs/{orgId}/members` answers from what the caller holds
 * there, which is the right rule for a tenant and the wrong one for support:
 * the case this exists for is an organization nobody left can administer. So
 * these routes hold no standing, are gated by `StaffGuard` alone, and may grant
 * any standing including `owner`.
 *
 * Two things still hold. `assertOwnerRemains` refuses to strand a partition
 * whoever asks, and every row written here is marked `actorIsStaff`, so a
 * tenant reading its own audit feed can tell a change came from the vendor
 * rather than from one of its own administrators.
 */
@ApiTags("Org members")
@Controller("admin/orgs/:orgId/members")
@UseGuards(StaffGuard)
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.STAFF_REQUIRED,
  AuthorizationErrors.UNAVAILABLE,
  OrgErrors.NOT_FOUND,
  InternalErrors.UNEXPECTED
)
export class AdminOrgMemberController {
  constructor(
    @Inject(MemberService) private readonly members: MemberService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  /** `PermitGuard` resolves this for a customer route; a staff route declares
   *  no permit, so it never runs and the group is resolved here instead. */
  private groupFor(orgId: string): Promise<string> {
    return this.checks.resolveGroup({ type: "org", orgId });
  }

  @Get()
  @ApiPathParams("orgId")
  @ApiOperation({
    summary: "List an organization's members",
    description:
      "**Staff only.** Everyone standing in the organization, whether or not you hold anything in it.",
  })
  @ApiResponse({ status: 200, type: MemberListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  async list(
    @Param("orgId") orgId: string,
    @Query() query: ListMembersDto
  ): Promise<MemberListResponse> {
    return await this.members.list(await this.groupFor(orgId), query);
  }

  @Get(":subjectId")
  @ApiPathParams("orgId", "subjectId")
  @ApiOperation({
    summary: "Get a member",
    description:
      "**Staff only.** One member by the subject the roster is keyed on, with the standing they hold and where it comes from.",
  })
  @ApiResponse({ status: 200, type: MemberResponseDto })
  @ApiPlatformErrors(MemberErrors.NOT_FOUND)
  async findBySubject(
    @Param("orgId") orgId: string,
    @Param("subjectId") subjectId: string
  ): Promise<MemberResponse> {
    return await this.members.findBySubject(
      await this.groupFor(orgId),
      subjectId
    );
  }

  @Post()
  @ApiPathParams("orgId")
  @ApiOperation({
    summary: "Add a member",
    description:
      "**Staff only.** Name the person by `email`, or a service account by `subject`. Any standing, including `owner`: the organization this is called for is often one that has nobody left who could appoint one. Adding somebody who already stands here replaces what they held.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "Member added" })
  @ApiPlatformErrors(
    MemberErrors.EMAIL_UNKNOWN,
    MemberErrors.LAST_OWNER,
    ValidationErrors.FAILED
  )
  async add(
    @CurrentPrincipal() principal: Principal,
    @Param("orgId") orgId: string,
    @Body() dto: CreateMemberDto
  ): Promise<void> {
    await this.members.add(
      principal,
      await this.groupFor(orgId),
      dto,
      AS_STAFF
    );
  }

  @Patch(":subjectId")
  @ApiPathParams("orgId", "subjectId")
  @ApiOperation({
    summary: "Change a member's standing",
    description:
      "**Staff only.** Refused for the last owner, as removal is: a demotion leaves the organization ownerless by the same arithmetic.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "Standing changed" })
  @ApiPlatformErrors(
    MemberErrors.LAST_OWNER,
    MemberErrors.NOT_FOUND,
    ValidationErrors.FAILED
  )
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param("orgId") orgId: string,
    @Param("subjectId") subjectId: string,
    @Body() dto: UpdateMemberDto
  ): Promise<void> {
    await this.members.setStanding(
      principal,
      await this.groupFor(orgId),
      subjectId,
      dto.standing,
      AS_STAFF
    );
  }

  @Delete(":subjectId")
  @ApiPathParams("orgId", "subjectId")
  @ApiOperation({
    summary: "Remove a member",
    description:
      "**Staff only.** Refused for the last owner, since nobody could administer the organization afterwards.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "Member removed" })
  @ApiPlatformErrors(MemberErrors.LAST_OWNER, MemberErrors.NOT_FOUND)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param("orgId") orgId: string,
    @Param("subjectId") subjectId: string
  ): Promise<void> {
    await this.members.remove(
      principal,
      await this.groupFor(orgId),
      subjectId,
      AS_STAFF
    );
  }
}

import {
  CurrentScope,
  RequirePermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type {
  MemberListResponse,
  MemberResponse,
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
  CreateMemberDto,
  ListMembersDto,
  MemberListResponseDto,
  MemberResponseDto,
  UpdateMemberDto,
} from "../../members/member.dtos";
import { MemberErrors } from "../../members/member.errors";
import { MemberService } from "../../members/member.service";
import { OrgErrors } from "../org.errors";

/**
 * Who is in an organization. Everyone here reaches every project in it, which
 * is why this is the list that decides what a tenant is.
 */
@ApiTags("Org members")
@Controller("orgs/:orgId/members")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  AuthorizationErrors.UNAVAILABLE,
  OrgErrors.NOT_FOUND,
  InternalErrors.UNEXPECTED
)
export class OrgMemberController {
  constructor(@Inject(MemberService) private readonly members: MemberService) {}

  @Get()
  @ApiPathParams("orgId")
  @RequirePermit("read")
  @ApiOperation({
    summary: "List an organization's members",
    description:
      "**Requires `read` on the organization.** Everyone signed in here, with the standing each holds. Profile fields are filled in where the platform has a user row; a member with none is a service account or somebody who has not signed in yet.",
  })
  @ApiResponse({ status: 200, type: MemberListResponseDto })
  list(
    @CurrentScope() scope: ResolvedScope,
    @Query() query: ListMembersDto
  ): Promise<MemberListResponse> {
    return this.members.list(scope.groupId, query);
  }

  @Get(":subjectId")
  @ApiPathParams("orgId", "subjectId")
  @RequirePermit("read")
  @ApiOperation({
    summary: "Get a member",
    description:
      "**Requires `read` on the organization.** One member by the subject the roster is keyed on, with the standing they hold and where it comes from. Somebody who reaches the organization from above resolves here as they do in the list. `userId` is the platform id to hold on to; `subject` is the identity provider's and moves when the provider does, so a surface resolving a stored id resolves it against the list rather than by addressing this route.",
  })
  @ApiResponse({ status: 200, type: MemberResponseDto })
  @ApiPlatformErrors(MemberErrors.NOT_FOUND)
  findBySubject(
    @CurrentScope() scope: ResolvedScope,
    @Param("subjectId") subjectId: string
  ): Promise<MemberResponse> {
    return this.members.findBySubject(scope.groupId, subjectId);
  }

  @Post()
  @ApiPathParams("orgId")
  @RequirePermit("manage")
  @ApiOperation({
    summary: "Add a member",
    description:
      "**Requires `manage` on the organization, and a standing strictly below your own.** Name the person by `email`, or a service account by `subject`. A manager hands out `editor` and `viewer` and never another manager, so the administration chain deepens only by a decision from above it. Owners are the exception and may appoint a peer. Adding somebody who already stands here replaces what they held.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "Member added" })
  @ApiPlatformErrors(
    MemberErrors.EMAIL_UNKNOWN,
    MemberErrors.LAST_OWNER,
    MemberErrors.SELF,
    AuthorizationErrors.ESCALATION_REFUSED,
    ValidationErrors.FAILED
  )
  add(
    @CurrentPrincipal() principal: Principal,
    @CurrentScope() scope: ResolvedScope,
    @Body() dto: CreateMemberDto
  ): Promise<void> {
    return this.members.add(principal, scope.groupId, dto);
  }

  @Patch(":subjectId")
  @ApiPathParams("orgId", "subjectId")
  @RequirePermit("manage")
  @ApiOperation({
    summary: "Change a member's standing",
    description:
      "**Requires `manage` on the organization, and both the standing they hold and the one they are given strictly below your own.** Refused for the last owner, as removal is: a demotion leaves the organization ownerless by the same arithmetic. Delete-then-write in one call, because holding two standings at once reads as a promotion that did not take.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "Standing changed" })
  @ApiPlatformErrors(
    MemberErrors.LAST_OWNER,
    MemberErrors.NOT_FOUND,
    MemberErrors.SELF,
    AuthorizationErrors.ESCALATION_REFUSED,
    ValidationErrors.FAILED
  )
  update(
    @CurrentPrincipal() principal: Principal,
    @CurrentScope() scope: ResolvedScope,
    @Param("subjectId") subjectId: string,
    @Body() dto: UpdateMemberDto
  ): Promise<void> {
    return this.members.setStanding(
      principal,
      scope.groupId,
      subjectId,
      dto.standing
    );
  }

  @Delete(":subjectId")
  @ApiPathParams("orgId", "subjectId")
  @RequirePermit("manage")
  @ApiOperation({
    summary: "Remove a member",
    description:
      "**Requires `manage` on the organization, and their standing strictly below your own.** Refused for the last owner, since nobody could administer the organization afterwards.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "Member removed" })
  @ApiPlatformErrors(
    MemberErrors.LAST_OWNER,
    MemberErrors.NOT_FOUND,
    MemberErrors.SELF
  )
  remove(
    @CurrentPrincipal() principal: Principal,
    @CurrentScope() scope: ResolvedScope,
    @Param("subjectId") subjectId: string
  ): Promise<void> {
    return this.members.remove(principal, scope.groupId, subjectId);
  }
}

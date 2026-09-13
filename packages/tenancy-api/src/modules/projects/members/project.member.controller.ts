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
import { ProjectErrors } from "../project.errors";

/**
 * Who is on a project. Two kinds of row: somebody added here, and somebody the
 * organization already carries into it, who is listed because they reach the
 * work and marked `inherited` because this is not where their standing lives.
 */
@ApiTags("Project members")
@Controller("projects/:projectId/members")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  AuthorizationErrors.UNAVAILABLE,
  ProjectErrors.NOT_FOUND,
  InternalErrors.UNEXPECTED
)
export class ProjectMemberController {
  constructor(@Inject(MemberService) private readonly members: MemberService) {}

  @Get()
  @ApiPathParams("projectId")
  @RequirePermit("read")
  @ApiOperation({
    summary: "List a project's members",
    description:
      "**Requires `read` on the project.** Everyone who reaches it, not only those added to it: a standing traverses the organization, so the owner who administers every project appears here without having been added. An organization's viewers are the exception, because `read` traverses `write`, which never admits one; they reach a project through the join it was created with and are absent from one made without it. Profile fields are filled in where the platform has a user row.",
  })
  @ApiResponse({ status: 200, type: MemberListResponseDto })
  list(
    @CurrentScope() scope: ResolvedScope,
    @Query() query: ListMembersDto
  ): Promise<MemberListResponse> {
    return this.members.list(scope.groupId, query);
  }

  @Get(":subjectId")
  @ApiPathParams("projectId", "subjectId")
  @RequirePermit("read")
  @ApiOperation({
    summary: "Get a member",
    description:
      "**Requires `read` on the project.** One member by the subject the roster is keyed on, with the standing they hold and whether it is held here or inherited from the organization. `userId` is the platform id to hold on to; `subject` is the identity provider's and moves when the provider does, so a surface resolving a stored id resolves it against the list rather than by addressing this route.",
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
  @ApiPathParams("projectId")
  @RequirePermit("manage")
  @ApiOperation({
    summary: "Add a member",
    description:
      "**Requires `manage` on the project, and a standing strictly below your own.** Name the person by `email`, or a service account by `subject`. A manager hands out `editor` and `viewer` and never another manager; owners may appoint a peer. Adding somebody who already stands here replaces what they held.",
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
  @ApiPathParams("projectId", "subjectId")
  @RequirePermit("manage")
  @ApiOperation({
    summary: "Change a member's standing",
    description:
      "**Requires `manage` on the project, and both the standing they hold and the one they are given strictly below your own.** Only somebody added here: a standing reaching down from the organization is changed there, and is refused here as no member of this project.",
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
  @ApiPathParams("projectId", "subjectId")
  @RequirePermit("manage")
  @ApiOperation({
    summary: "Remove a member",
    description:
      "**Requires `manage` on the project, and their standing strictly below your own.** Only somebody added here: whoever reaches the project from the organization is removed there. Refused for a last owner nothing above can replace.",
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

import { RequirePermit } from "@aec-craft/platform-authorization/nest";
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
  type ProjectListResponse,
  type ProjectResponse,
  projectList,
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
import { OrgErrors } from "../orgs/org.errors";
import {
  CreateProjectDto,
  ListProjectsDto,
  ProjectListResponseDto,
  ProjectResponseDto,
  UpdateProjectDto,
} from "./project.dtos";
import { ProjectErrors } from "./project.errors";
import { ProjectService } from "./project.service";

/**
 * Creating a project takes org-level `admin` rather than `manage`, because a
 * project is a partition of the organization: it lists at the top level and
 * joins every org standing at birth, so the whole tenant sees it appear. `own`
 * is kept for ending the tenant itself.
 *
 * Both list routes are bounded by what the caller can read, so a project they
 * hold nothing on is absent rather than forbidden.
 */
@ApiTags("Projects")
@Controller("projects")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.UNAVAILABLE,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class ProjectController {
  constructor(
    @Inject(ProjectService) private readonly projects: ProjectService
  ) {}

  @Get()
  @ApiOperation({
    summary: "List my projects",
    description:
      "Projects you can read, across every organization. Default sort is `name:asc`.",
  })
  @ApiResponse({ status: 200, type: ProjectListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(projectList.filters)
  @ApiPaginationQueries(projectList.pagination)
  list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListProjectsDto
  ): Promise<ProjectListResponse> {
    return this.projects.list(query, { type: "readableBy", principal });
  }

  @Get(":projectId")
  @ApiPathParams("projectId")
  @ApiOperation({
    summary: "Get a project",
    description:
      "**Requires `read` on the project.** One you cannot read is absent rather than refused, so the answer never reveals that it exists.",
  })
  @RequirePermit("read")
  @ApiResponse({ status: 200, type: ProjectResponseDto })
  @ApiPlatformErrors(ProjectErrors.NOT_FOUND)
  findById(@Param("projectId") projectId: string): Promise<ProjectResponse> {
    return this.projects.findById(projectId);
  }

  @Patch(":projectId")
  @ApiPathParams("projectId")
  @ApiOperation({
    summary: "Update a project",
    description:
      "**Requires `manage` on the project.** Change its name or slug. Metadata is written through `PUT /projects/:projectId/metadata/:keyPath`.",
  })
  @RequirePermit("manage")
  @ApiResponse({ status: 200, type: ProjectResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    AuthorizationErrors.FORBIDDEN,
    ProjectErrors.NOT_FOUND,
    ProjectErrors.SLUG_TAKEN
  )
  update(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string,
    @Body() dto: UpdateProjectDto
  ): Promise<ProjectResponse> {
    return this.projects.update(projectId, dto, principal);
  }

  @Delete(":projectId")
  @ApiPathParams("projectId")
  @ApiOperation({
    summary: "Delete a project",
    description:
      "**Requires `admin` on the project.** Permanently deletes the project and every group beneath it. This cannot be undone.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermit("admin")
  @ApiResponse({ status: 204, description: "Project deleted" })
  @ApiPlatformErrors(AuthorizationErrors.FORBIDDEN, ProjectErrors.NOT_FOUND)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string
  ): Promise<void> {
    await this.projects.delete(projectId, principal);
  }
}

@ApiTags("Projects")
@Controller("orgs/:orgId/projects")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.UNAVAILABLE,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class OrgProjectController {
  constructor(
    @Inject(ProjectService) private readonly projects: ProjectService
  ) {}

  @Get()
  @ApiPathParams("orgId")
  @ApiOperation({
    summary: "List my projects in an organization",
    description:
      "The same as `GET /projects?orgId=eq.{orgId}`, as a nested route for clients that walk the organization to project hierarchy.",
  })
  @ApiResponse({ status: 200, type: ProjectListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(projectList.filters, { omit: ["orgId"] })
  @ApiPaginationQueries(projectList.pagination)
  listForOrg(
    @Param("orgId") orgId: string,
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListProjectsDto
  ): Promise<ProjectListResponse> {
    return this.projects.list(
      { ...query, orgId: `eq.${orgId}` },
      { type: "readableBy", principal }
    );
  }

  @Post()
  @ApiPathParams("orgId")
  @ApiOperation({
    summary: "Create a project",
    description:
      "**Requires `admin` on the organization.** Creates the project inside the organization. Everyone who can already act in the organization reaches the new project too, at the standing they hold there. Slugs are unique within an organization; conflicts get a numeric suffix.",
  })
  @HttpCode(HttpStatus.CREATED)
  @RequirePermit("admin")
  @ApiResponse({ status: 201, type: ProjectResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    AuthorizationErrors.FORBIDDEN,
    OrgErrors.NOT_FOUND,
    ProjectErrors.SLUG_TAKEN
  )
  create(
    @Param("orgId") orgId: string,
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateProjectDto
  ): Promise<ProjectResponse> {
    return this.projects.create(orgId, principal, dto);
  }
}

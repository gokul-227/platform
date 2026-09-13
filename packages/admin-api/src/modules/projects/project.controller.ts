import { StaffGuard } from "@aec-craft/platform-authorization/nest";
import {
  ApiFilterQueries,
  ApiPaginationQueries,
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type {
  ProjectListResponse,
  ProjectResponse,
} from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  projectList,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import { ProjectErrors } from "@aec-craft/platform-tenancy-api";
import { ProjectService } from "@aec-craft/platform-tenancy-api/nest";
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
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
  ListProjectsDto,
  ProjectListResponseDto,
  ProjectResponseDto,
  UpdateProjectDto,
} from "./project.dtos";

/**
 * `estate` is `ProjectService`'s own query with its visibility predicate off,
 * which is what makes these reads span every tenant.
 */
@ApiTags("Projects")
@Controller("admin/projects")
@UseGuards(StaffGuard)
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.STAFF_REQUIRED,
  InternalErrors.UNEXPECTED
)
export class AdminProjectController {
  constructor(
    @Inject(ProjectService) private readonly projects: ProjectService
  ) {}

  @Get()
  @ApiOperation({
    summary: "List all projects",
    description:
      "**Staff only.** Every project in the estate, across every organization. Default sort is `name:asc`.",
  })
  @ApiResponse({ status: 200, type: ProjectListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(projectList.filters)
  @ApiPaginationQueries(projectList.pagination)
  list(@Query() query: ListProjectsDto): Promise<ProjectListResponse> {
    return this.projects.list(query, { type: "estate" });
  }

  @Get(":projectId")
  @ApiPathParams("projectId")
  @ApiOperation({
    summary: "Get a project",
    description:
      "**Staff only.** One project by id. Absent means absent here: this surface masks nothing, unlike `GET /projects/{projectId}`, which also hides one you may not see.",
  })
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
      "**Staff only.** Change its name or slug. Leaves the same audit row a tenant's own admin would, naming you as the actor.",
  })
  @ApiResponse({ status: 200, type: ProjectResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
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
}

/** The same rows as `/admin/projects`, for a console walking the tenant tree. */
@ApiTags("Projects")
@Controller("admin/orgs/:orgId/projects")
@UseGuards(StaffGuard)
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.STAFF_REQUIRED,
  InternalErrors.UNEXPECTED
)
export class AdminOrgProjectController {
  constructor(
    @Inject(ProjectService) private readonly projects: ProjectService
  ) {}

  @Get()
  @ApiPathParams("orgId")
  @ApiOperation({
    summary: "List all projects in an organization",
    description:
      "**Staff only.** The same as `GET /admin/projects?orgId=eq.{orgId}`, as a nested route for a console walking the organization to project hierarchy.",
  })
  @ApiResponse({ status: 200, type: ProjectListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(projectList.filters, { omit: ["orgId"] })
  @ApiPaginationQueries(projectList.pagination)
  list(
    @Param("orgId") orgId: string,
    @Query() query: ListProjectsDto
  ): Promise<ProjectListResponse> {
    return this.projects.list(
      { ...query, orgId: `eq.${orgId}` },
      { type: "estate" }
    );
  }
}

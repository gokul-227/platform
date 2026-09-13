import { StaffGuard } from "@aec-craft/platform-authorization/nest";
import {
  ApiFilterQueries,
  ApiPaginationQueries,
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type {
  OrgListResponse,
  OrgResponse,
} from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  orgList,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import { MemberErrors, OrgErrors } from "@aec-craft/platform-tenancy-api";
import { OrgService } from "@aec-craft/platform-tenancy-api/nest";
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
  CreateOrgDto,
  ListOrgsDto,
  OrgListResponseDto,
  OrgResponseDto,
  UpdateOrgDto,
} from "./org.dtos";

/**
 * `estate` is `OrgService`'s own query with its visibility predicate off, which
 * is what makes these reads span every tenant.
 */
@ApiTags("Orgs")
@Controller("admin/orgs")
@UseGuards(StaffGuard)
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.STAFF_REQUIRED,
  InternalErrors.UNEXPECTED
)
export class AdminOrgController {
  constructor(@Inject(OrgService) private readonly orgs: OrgService) {}

  @Get()
  @ApiOperation({
    summary: "List all organizations",
    description:
      "**Staff only.** Every organization in the estate. Default sort is `name:asc`.",
  })
  @ApiResponse({ status: 200, type: OrgListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(orgList.filters)
  @ApiPaginationQueries(orgList.pagination)
  list(@Query() query: ListOrgsDto): Promise<OrgListResponse> {
    return this.orgs.list(query, { type: "estate" });
  }

  @Get(":orgId")
  @ApiPathParams("orgId")
  @ApiOperation({
    summary: "Get an organization",
    description:
      "**Staff only.** One organization by id. Absent means absent here: this surface masks nothing, unlike `GET /orgs/{orgId}`, which also hides one you may not see.",
  })
  @ApiResponse({ status: 200, type: OrgResponseDto })
  @ApiPlatformErrors(OrgErrors.NOT_FOUND)
  findById(@Param("orgId") orgId: string): Promise<OrgResponse> {
    return this.orgs.findById(orgId);
  }

  @Patch(":orgId")
  @ApiPathParams("orgId")
  @ApiOperation({
    summary: "Update an organization",
    description:
      "**Staff only.** Change its name or slug. Leaves the same audit row a tenant's own admin would, naming you as the actor.",
  })
  @ApiResponse({ status: 200, type: OrgResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    OrgErrors.NOT_FOUND,
    OrgErrors.SLUG_TAKEN
  )
  update(
    @CurrentPrincipal() principal: Principal,
    @Param("orgId") orgId: string,
    @Body() dto: UpdateOrgDto
  ): Promise<OrgResponse> {
    return this.orgs.update(orgId, dto, principal, { type: "staff" });
  }

  @Post()
  @ApiOperation({
    summary: "Create an organization",
    description:
      "**Staff only.** Sets a customer up with their first organization. `ownerEmail` becomes its owner and you are not added to it — which is the whole difference from `POST /orgs`, where the caller becomes the owner. If you do not provide a slug one is derived from the name, and a numeric suffix is appended if it is taken.",
  })
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, type: OrgResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    OrgErrors.SLUG_TAKEN,
    MemberErrors.EMAIL_UNKNOWN
  )
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateOrgDto
  ): Promise<OrgResponse> {
    return this.orgs.create(principal, dto, {
      type: "staff",
      ownerEmail: dto.ownerEmail,
    });
  }

  @Delete(":orgId")
  @ApiPathParams("orgId")
  @ApiOperation({
    summary: "Delete an organization",
    description:
      "**Staff only.** Removes the organization, its group tree and everything scoped to it. Irreversible today: there is no grace period yet, so nothing can be restored once this returns.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "Organization deleted" })
  @ApiPlatformErrors(OrgErrors.NOT_FOUND)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param("orgId") orgId: string
  ): Promise<void> {
    await this.orgs.delete(orgId, principal, { type: "staff" });
  }
}

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
  type OrgListResponse,
  type OrgResponse,
  orgList,
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
  CreateOrgDto,
  ListOrgsDto,
  OrgListResponseDto,
  OrgResponseDto,
  UpdateOrgDto,
} from "./org.dtos";
import { OrgErrors } from "./org.errors";
import { OrgService } from "./org.service";

/**
 * The tenant row only; membership is a standing, behind `/groups`.
 *
 * `list` and `create` carry no group to authorize against: the first is bounded
 * by what the caller can read, and the second creates the group it would have
 * been checked against.
 */
@ApiTags("Orgs")
@Controller("orgs")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.UNAVAILABLE,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class OrgController {
  constructor(@Inject(OrgService) private readonly orgs: OrgService) {}

  @Get()
  @ApiOperation({
    summary: "List my organizations",
    description: "Organizations you can read. Default sort is `name:asc`.",
  })
  @ApiResponse({ status: 200, type: OrgListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(orgList.filters)
  @ApiPaginationQueries(orgList.pagination)
  list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListOrgsDto
  ): Promise<OrgListResponse> {
    return this.orgs.list(query, { type: "readableBy", principal });
  }

  @Get(":orgId")
  @ApiPathParams("orgId")
  @ApiOperation({
    summary: "Get an organization",
    description:
      "**Requires `read` on the organization.** One you cannot read is absent rather than refused, so the answer never reveals that it exists.",
  })
  @RequirePermit("read")
  @ApiResponse({ status: 200, type: OrgResponseDto })
  @ApiPlatformErrors(OrgErrors.NOT_FOUND)
  findById(@Param("orgId") orgId: string): Promise<OrgResponse> {
    return this.orgs.findById(orgId);
  }

  @Post()
  @ApiOperation({
    summary: "Create an organization",
    description:
      "Open to any signed-in caller: creates the organization with you as its owner, in one transaction. If you do not provide a slug one is derived from the name, and a numeric suffix is appended if it is taken (`acme`, `acme-2`, …).",
  })
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, type: OrgResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, OrgErrors.SLUG_TAKEN)
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateOrgDto
  ): Promise<OrgResponse> {
    return this.orgs.create(principal, dto);
  }

  @Patch(":orgId")
  @ApiPathParams("orgId")
  @ApiOperation({
    summary: "Update an organization",
    description:
      "**Requires `admin` on the organization.** Change its name or slug. Metadata is written through `PUT /orgs/:orgId/metadata/:keyPath`.",
  })
  @RequirePermit("admin")
  @ApiResponse({ status: 200, type: OrgResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    AuthorizationErrors.FORBIDDEN,
    OrgErrors.NOT_FOUND,
    OrgErrors.SLUG_TAKEN
  )
  update(
    @CurrentPrincipal() principal: Principal,
    @Param("orgId") orgId: string,
    @Body() dto: UpdateOrgDto
  ): Promise<OrgResponse> {
    return this.orgs.update(orgId, dto, principal);
  }

  @Delete(":orgId")
  @ApiPathParams("orgId")
  @ApiOperation({
    summary: "Delete an organization",
    description:
      "**Requires `own` on the organization.** Permanently deletes the organization, its projects and every group beneath it. This cannot be undone.",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermit("own")
  @ApiResponse({ status: 204, description: "Organization deleted" })
  @ApiPlatformErrors(AuthorizationErrors.FORBIDDEN, OrgErrors.NOT_FOUND)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param("orgId") orgId: string
  ): Promise<void> {
    await this.orgs.delete(orgId, principal);
  }
}

import {
  AuthorizationService,
  RequirePermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiFilterQueries,
  ApiHydrationQuery,
  ApiPaginationQueries,
  ApiPathParams,
  ApiPlatformErrors,
  ApiScopeQueries,
  ApiSelectQuery,
} from "@aec-craft/platform-common/nest";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  type GraphNodeListResponse,
  type GraphNodeResponse,
  graphNodeFilters,
  graphNodeList,
  InternalErrors,
  scopeOfQuery,
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
  GetObjectQueryDto,
  ListObjectsDto,
  ObjectListResponseDto,
  ObjectResponseDto,
} from "./object.dtos";
import { ObjectErrors } from "./object.errors";
import { ObjectService } from "./object.service";

/**
 * Read-only: a building arrives from an importer as a changeset, and a lone
 * create or delete would leave an element with no place in the spatial tree or
 * orphan the edges citing it.
 * TODO(#231): patch the properties bag, over the changeset.
 */
@ApiTags("Objects")
@Controller("objects")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class ObjectCollectionController {
  constructor(
    @Inject(ObjectService) private readonly objects: ObjectService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Get()
  @ApiScopeQueries()
  @RequirePermit("read")
  @ApiOperation({
    summary: "List objects",
    description:
      "**Requires `read` on the organization or project named.** The building's nodes: sites, storeys, spaces and elements. Name exactly one of `orgId` or `projectId`; a project read hydrates the parent org's shared library and `?scope=project` narrows to the project's own. Same filter, sort, cursor and `?select=` grammar as the graph node list, narrowed to `type: object` before the query runs, so no rule or source can appear here whatever a caller passes.",
  })
  @ApiResponse({ status: 200, type: ObjectListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(graphNodeFilters)
  @ApiSelectQuery()
  @ApiHydrationQuery()
  @ApiPaginationQueries(graphNodeList.pagination)
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListObjectsDto
  ): Promise<GraphNodeListResponse> {
    const scope = await this.checks.scopeIn(scopeOfQuery(query));
    return await this.objects.list(
      scope,
      query,
      await this.checks.readableGroups(principal, scope)
    );
  }

  @Get(":objectId")
  @ApiPathParams("objectId")
  @ApiOperation({
    summary: "Get an object",
    description:
      "**Requires `read` on the project.** One node by id, scoped to the building half.",
  })
  @ApiResponse({ status: 200, type: ObjectResponseDto })
  @ApiSelectQuery()
  @ApiPlatformErrors(ObjectErrors.NOT_FOUND)
  async findById(
    @CurrentPrincipal() principal: Principal,
    @Param("objectId") objectId: string,
    @Query() query: GetObjectQueryDto
  ): Promise<GraphNodeResponse> {
    return await this.objects.findById(
      await this.objects.authorize(principal, objectId, "read"),
      objectId,
      query.select
    );
  }
}

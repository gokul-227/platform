import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
import {
  ApiFilterQueries,
  ApiPaginationQueries,
  ApiPlatformErrors,
  ApiScopeQueries,
  ApiSelectQuery,
} from "@aec-craft/platform-common/nest";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  type GraphNodeListResponse,
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
import { Controller, Get, Inject, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { GraphNodeListResponseDto, ListGraphNodesDto } from "./graph.node.dtos";
import { GraphNodeService } from "./graph.node.service";

@ApiTags("Graph nodes")
@Controller("graph/nodes")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class GraphNodeCollectionController {
  constructor(
    @Inject(GraphNodeService) private readonly nodes: GraphNodeService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Get()
  @ApiScopeQueries()
  @ApiOperation({
    summary: "List graph nodes",
    description:
      "**Requires `read` on the organization or project named.** Name exactly one of `orgId` or `projectId`. A project read hydrates the project's own nodes with the parent org's shared library; `?scope=project` narrows to project-only. Newest first, paginate with `limit` (default 50, max 200) + `cursor`, project the `properties` bag with `?select=<key>` (repeatable).",
  })
  @ApiResponse({ status: 200, type: GraphNodeListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(graphNodeFilters)
  @ApiSelectQuery()
  @ApiPaginationQueries(graphNodeList.pagination)
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListGraphNodesDto
  ): Promise<GraphNodeListResponse> {
    const scope = await this.checks.scopeIn(scopeOfQuery(query));
    await this.checks.assertCan(principal, "read", scope.groupId);
    return this.nodes.list(
      scope,
      query,
      await this.checks.readableGroups(principal, scope)
    );
  }
}

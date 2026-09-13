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
  type GraphEdgeListResponse,
  graphEdgeFilters,
  graphEdgeList,
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
import { GraphEdgeListResponseDto, ListGraphEdgesDto } from "./graph.edge.dtos";
import { GraphEdgeService } from "./graph.edge.service";

/** The org's shared library of edges, filtered by row as the nodes are. */
@ApiTags("Graph edges")
@Controller("graph/edges")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class GraphEdgeCollectionController {
  constructor(
    @Inject(GraphEdgeService) private readonly edges: GraphEdgeService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Get()
  @ApiScopeQueries()
  @ApiOperation({
    summary: "List graph edges",
    description:
      "**Requires `read` on the organization or project named.** Name exactly one of `orgId` or `projectId`. A project read hydrates the project's own edges with the parent org's shared library; `?scope=project` narrows to project-only. Same filter, cursor and `?select=` grammar as the node list.",
  })
  @ApiResponse({ status: 200, type: GraphEdgeListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(graphEdgeFilters)
  @ApiSelectQuery()
  @ApiPaginationQueries(graphEdgeList.pagination)
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListGraphEdgesDto
  ): Promise<GraphEdgeListResponse> {
    const scope = await this.checks.scopeIn(scopeOfQuery(query));
    await this.checks.assertCan(principal, "read", scope.groupId);
    return this.edges.list(
      scope,
      query,
      await this.checks.readableGroups(principal, scope)
    );
  }
}

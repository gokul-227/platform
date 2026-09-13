import {
  CurrentScope,
  RequireRowPermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
  ApiSelectQuery,
} from "@aec-craft/platform-common/nest";
import type {
  GraphEdgeResponse,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
} from "@aec-craft/platform-contracts";
import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { GetGraphEdgeQueryDto, GraphEdgeResponseDto } from "./graph.edge.dtos";
import { GraphEdgeErrors } from "./graph.edge.errors";
import { GRAPH_EDGE_ROW } from "./graph.edge.row";
import { GraphEdgeService } from "./graph.edge.service";

/** Flat for the same reason the node by-id route is. */
@ApiTags("Graph edges")
@Controller("graph/edges")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class GraphEdgeController {
  constructor(
    @Inject(GraphEdgeService) private readonly edges: GraphEdgeService
  ) {}

  @Get(":edgeId")
  @RequireRowPermit("read", GRAPH_EDGE_ROW)
  @ApiPathParams("edgeId")
  @ApiOperation({
    summary: "Get a graph edge",
    description:
      "**Requires `read` on the scope the edge belongs to.** " +
      "Returns a single edge by id. Pass `?select=<blockKey>` (repeatable) to project the edge's `properties` bag, same semantics as on nodes. " +
      "An edge the caller cannot see is absent rather than refused, so the answer never reveals that it exists.",
  })
  @ApiResponse({ status: 200, type: GraphEdgeResponseDto })
  @ApiSelectQuery()
  @ApiPlatformErrors(GraphEdgeErrors.NOT_FOUND)
  async findById(
    @CurrentScope() scope: ResolvedScope,
    @Param("edgeId") edgeId: string,
    @Query() query: GetGraphEdgeQueryDto
  ): Promise<GraphEdgeResponse> {
    return this.edges.findById(scope, edgeId, query.select);
  }
}

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
  GraphNodeResponse,
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
import { GetGraphNodeQueryDto, GraphNodeResponseDto } from "./graph.node.dtos";
import { GraphNodeErrors } from "./graph.node.errors";
import { GRAPH_NODE_ROW } from "./graph.node.row";
import { GraphNodeService } from "./graph.node.service";

/**
 * Flat on purpose: a node's group is a column rather than its partition, so a
 * nested by-id URL would assert the project is the authority over a row a
 * contractor owns. The scope is read off the row instead.
 */
@ApiTags("Graph nodes")
@Controller("graph/nodes")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class GraphNodeController {
  constructor(
    @Inject(GraphNodeService) private readonly nodes: GraphNodeService
  ) {}

  @Get(":nodeId")
  @RequireRowPermit("read", GRAPH_NODE_ROW)
  @ApiPathParams("nodeId")
  @ApiOperation({
    summary: "Get a graph node",
    description:
      "**Requires `read` on the scope the node belongs to.** " +
      "Returns a single node by id. Pass `?select=<blockKey>` (repeatable) to trim the response's `properties` bag to specific top-level keys; missing keys come back as `null` so the shape stays stable. " +
      "The response's scope is reflected by `projectId` (`null` => org-scoped). " +
      "A node the caller cannot see is absent rather than refused, so the answer never reveals that it exists.",
  })
  @ApiResponse({ status: 200, type: GraphNodeResponseDto })
  @ApiSelectQuery()
  @ApiPlatformErrors(GraphNodeErrors.NOT_FOUND)
  async findById(
    @CurrentScope() scope: ResolvedScope,
    @Param("nodeId") nodeId: string,
    @Query() query: GetGraphNodeQueryDto
  ): Promise<GraphNodeResponse> {
    return this.nodes.findById(scope, nodeId, query.select);
  }
}

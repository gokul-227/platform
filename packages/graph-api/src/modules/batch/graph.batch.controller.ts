import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
import {
  ApiPlatformErrors,
  ApiScopeQueries,
} from "@aec-craft/platform-common/nest";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  type GraphBatchResponse,
  InternalErrors,
  scopeOfQuery,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { GraphEdgeErrors } from "../edges/graph.edge.errors";
import { GraphNodeErrors } from "../nodes/graph.node.errors";
import {
  ApplyGraphBatchDto,
  GraphBatchResponseDto,
  GraphScopeQueryDto,
} from "./graph.batch.dtos";
import { GraphBatchErrors } from "./graph.batch.errors";
import { GraphBatchService } from "./graph.batch.service";

/**
 * The one transactional write surface: either every op applies or none does, and
 * a single mutation is an array of one. Reads stay on the collection and by-id
 * routes.
 *
 * Nesting is truthful because a changeset carries exactly one scope. `groupId`
 * still chooses an owner within it, which is how a contractor's import lands in
 * the project and belongs to the contractor.
 */
const BATCH_ERRORS = [
  ValidationErrors.FAILED,
  GraphNodeErrors.BATCH_ID_CONFLICT,
  GraphNodeErrors.NOT_FOUND,
  GraphNodeErrors.PARENT_NOT_FOUND,
  GraphNodeErrors.PARENT_CROSS_SCOPE,
  GraphNodeErrors.PARENT_CYCLE,
  GraphNodeErrors.CLASS_ROOT_IMMUTABLE,
  GraphEdgeErrors.BATCH_ID_CONFLICT,
  GraphEdgeErrors.NOT_FOUND,
  GraphEdgeErrors.SOURCE_NOT_FOUND,
  GraphEdgeErrors.TARGET_NOT_FOUND,
  GraphEdgeErrors.SELF_LOOP,
  GraphEdgeErrors.CROSS_ORG,
  GraphEdgeErrors.CROSS_PROJECT,
  GraphBatchErrors.EDGE_ENDPOINT_DELETED,
] as const;

const CHANGESET_DESCRIPTION =
  "One call is one transaction over both kinds: either every op applies or none does. " +
  "Provide `nodes` and/or `edges` as arrays of ops tagged by `op` (`create | upsert | update | delete`); send a single mutation as an array of one. " +
  "The server orders the transaction node writes -> edge writes -> edge deletes -> node deletes, so a node and the edges touching it can ride in the same call; " +
  "client-supplied ids let edges reference nodes created in the same changeset. An edge write onto a node the same changeset deletes is refused, and the whole call with it. " +
  "The response splits the resulting rows and a per-kind summary (`created`/`updated`/`deleted`/`skipped`).";

@ApiTags("Graph changeset")
@Controller("graph")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class GraphBatchController {
  constructor(
    @Inject(GraphBatchService) private readonly batch: GraphBatchService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post()
  @ApiScopeQueries()
  @ApiOperation({
    summary: "Apply a changeset",
    description:
      "**Requires `write` on the organization or project named, or on the `groupId` in the body when one is named.** " +
      `Name exactly one of \`orgId\` or \`projectId\`: the rows land in whichever it names. ${CHANGESET_DESCRIPTION}`,
  })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: GraphBatchResponseDto })
  @ApiPlatformErrors(...BATCH_ERRORS)
  async apply(
    @CurrentPrincipal() principal: Principal,
    @Query() query: GraphScopeQueryDto,
    @Body() dto: ApplyGraphBatchDto
  ): Promise<GraphBatchResponse> {
    // Every op is a mutation and `write` covers update and delete alike, so
    // one permit on the scope the URL names settles the whole changeset.
    const scope = await this.checks.scopeIn(scopeOfQuery(query), dto.groupId);
    await this.checks.assertCan(principal, "write", scope.groupId);
    return this.batch.applyChangeset(scope, dto, principal);
  }
}

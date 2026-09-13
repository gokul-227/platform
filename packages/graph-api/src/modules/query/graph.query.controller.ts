import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
import {
  ApiPlatformErrors,
  ApiProjectScopeQuery,
} from "@aec-craft/platform-common/nest";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  type CypherQueryResponse,
  type GraphHealthResponse,
  InternalErrors,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import { GraphClientErrors } from "@aec-craft/platform-graph-client";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import {
  Body,
  Controller,
  Get,
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
import {
  CypherQueryResponseDto,
  GraphHealthResponseDto,
  ProjectScopeQueryDto,
  RunCypherQueryDto,
} from "./graph.query.dtos";
import { GraphQueryErrors } from "./graph.query.errors";
import { GraphQueryService } from "./graph.query.service";

/**
 * Project-scoped only: the projection is queried through `$orgId` and
 * `$projectId`, so there is no org-library equivalent to nest. Registered
 * everywhere, and answering 503 where no graph database is configured.
 *
 * One open endpoint while usage settles, guarded by a write-clause rejection, a
 * read-only bolt transaction, injected scope parameters, and a fail-closed
 * check on every returned entity. A scalar aggregate over out-of-scope data is
 * the known gap.
 */
@ApiTags("Graph queries")
@Controller("graph")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class GraphQueryController {
  constructor(
    @Inject(GraphQueryService) private readonly queries: GraphQueryService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post("query")
  @ApiProjectScopeQuery()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Run a read-only Cypher query (experimental)",
    description:
      "**Requires `read` on the project.** Executes an openCypher statement against the projected " +
      "graph view and returns the records (nodes, relationships and paths mapped to tagged JSON shapes, " +
      "capped at 1000 rows, 5s timeout). " +
      "**Every node pattern must carry the `:Scoped` label**, which the server replaces with the label " +
      "this project's rows carry: `MATCH (n:Scoped) RETURN n`, `MATCH (s:Storey:Scoped)-[r:CONTAINS]->(e:Scoped) RETURN s, r, e`. " +
      "A pattern without it is refused rather than run, because an unlabelled node matches the whole " +
      "projection and a statement returning only a count leaves nothing to check afterwards. " +
      "`Scope_`, `Org_` and `Project_` labels are the server's to write, and variable-length hops " +
      "(`[*1..3]`) are refused because they walk through nodes no pattern constrained. " +
      "A read sees this project's own rows and **not** the organization's shared library, which " +
      "`/objects`, `/rules` and the graph lists all hydrate; a single label is the only fence that " +
      "composes with a label you wrote. " +
      "`$orgId` and `$projectId` are injected as parameters for filtering on properties. " +
      "Write clauses are rejected; all writes go through the changeset at `POST /graph?projectId=` " +
      "so versioning and sync stay correct. " +
      "The projection trails writes by the sync lag (target p99 < 5s). " +
      "A deployment with no graph database configured cannot serve this route at all. " +
      "EXPERIMENTAL: contract may change; typed traversal routes will supersede common patterns.",
  })
  @ApiResponse({ status: 200, type: CypherQueryResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    GraphClientErrors.UNAVAILABLE,
    GraphQueryErrors.CYPHER_NOT_READ_ONLY,
    GraphQueryErrors.CYPHER_SCOPE_RESERVED,
    GraphQueryErrors.CYPHER_SCOPE_VIOLATION,
    GraphQueryErrors.CYPHER_UNSCOPED,
    GraphQueryErrors.CYPHER_VARIABLE_LENGTH
  )
  async query(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ProjectScopeQueryDto,
    @Body() dto: RunCypherQueryDto
  ): Promise<CypherQueryResponse> {
    const scope = await this.checks.scopeIn({
      type: "project",
      projectId: query.projectId,
    });
    await this.checks.assertCan(principal, "read", scope.groupId);
    return this.queries.cypher(dto, {
      orgId: scope.orgId,
      projectId: query.projectId,
    });
  }

  @Get("health")
  @ApiProjectScopeQuery()
  @ApiOperation({
    summary: "Check graph database health",
    description:
      "**Requires `read` on the project.** Reports whether the projected graph database is " +
      "reachable. Always answers 200 (a health probe reports status, it does not error): " +
      "`{ reachable, engine, latencyMs }`. When no graph database is configured this is " +
      "`reachable: false` with a null engine and latency; otherwise it times a connectivity " +
      "check and reports the configured engine (`memgraph` / `neo4j`) and measured round-trip " +
      "in milliseconds (both null on a connectivity failure). " +
      "This is purely a reachability probe; it does not lint the projection's structure.",
  })
  @ApiResponse({ status: 200, type: GraphHealthResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  async health(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ProjectScopeQueryDto
  ): Promise<GraphHealthResponse> {
    const scope = await this.checks.scopeIn({
      type: "project",
      projectId: query.projectId,
    });
    await this.checks.assertCan(principal, "read", scope.groupId);
    return this.queries.health();
  }
}

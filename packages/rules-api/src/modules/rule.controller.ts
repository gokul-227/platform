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
  GetRuleQueryDto,
  ListRulesDto,
  RuleListResponseDto,
  RuleResponseDto,
} from "./rule.dtos";
import { RuleErrors } from "./rule.errors";
import { RuleService } from "./rule.service";

/**
 * Read-only for now. Delete stays absent even once writes land: disabling a rule
 * keeps its verdicts, its provenance and its place in the coverage denominator.
 * TODO(#231): create and patch over the changeset.
 */
@ApiTags("Rules")
@Controller("rules")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class RuleCollectionController {
  constructor(
    @Inject(RuleService) private readonly rules: RuleService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}
  @Get()
  @ApiScopeQueries()
  @RequirePermit("read")
  @ApiOperation({
    summary: "List rules",
    description:
      "**Requires `read` on the organization or project named.** The corpus: each rule's class, its selector and its criterion. Name exactly one of `orgId` or `projectId`. An organisation's rules are its design intent, held once and hydrated into every project read the way an org file library is; `?scope=project` narrows to the project's own. Same filter, sort, cursor and `?select=` grammar as the graph node list, narrowed to `type: rule` before the query runs.",
  })
  @ApiResponse({ status: 200, type: RuleListResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  @ApiFilterQueries(graphNodeFilters)
  @ApiSelectQuery()
  @ApiHydrationQuery()
  @ApiPaginationQueries(graphNodeList.pagination)
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ListRulesDto
  ): Promise<GraphNodeListResponse> {
    const scope = await this.checks.scopeIn(scopeOfQuery(query));
    return await this.rules.list(
      scope,
      query,
      await this.checks.readableGroups(principal, scope)
    );
  }

  @Get(":ruleId")
  @ApiPathParams("ruleId")
  @ApiOperation({
    summary: "Get a rule",
    description:
      "**Requires `read` on the project.** One rule by id, with its selector, criterion and provenance.",
  })
  @ApiResponse({ status: 200, type: RuleResponseDto })
  @ApiSelectQuery()
  @ApiPlatformErrors(RuleErrors.NOT_FOUND)
  async findById(
    @CurrentPrincipal() principal: Principal,
    @Param("ruleId") ruleId: string,
    @Query() query: GetRuleQueryDto
  ): Promise<GraphNodeResponse> {
    return await this.rules.findById(
      await this.rules.authorize(principal, ruleId, "read"),
      ruleId,
      query.select
    );
  }
}

import {
  AuthorizationService,
  RequirePermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiPaginationQueries,
  ApiPathParams,
  ApiPlatformErrors,
  ApiProjectScopeQuery,
} from "@aec-craft/platform-common/nest";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  graphNodeList,
  InternalErrors,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ProjectScopeQueryDto,
  StartRuleExtractionDto,
} from "./rule.extraction.dtos";
import { RuleExtractionService } from "./rule.extraction.service";

/**
 * The route surface only; every handler answers 501.
 *
 * Project-scoped throughout, and required rather than optional: extraction
 * reads a document and grounds itself in the model that document describes, and
 * an organization has no model to ground in.
 * TODO(#232): the extraction pipeline.
 */
@ApiTags("Rule extraction")
@Controller("rules/extractions")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.NOT_IMPLEMENTED,
  InternalErrors.UNEXPECTED
)
export class RuleExtractionController {
  constructor(
    @Inject(RuleExtractionService)
    private readonly extractions: RuleExtractionService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post()
  @ApiProjectScopeQuery()
  @RequirePermit("write")
  @ApiOperation({
    summary: "Extract rules from a document",
    description:
      "**Requires `write` on the project.** Reads a document already in the files API and writes the rules it can formalise. Unlike every other route in this package this is a write, and the permit says so. " +
      "A second run over the same document extends rather than replaces: a reviewed rule survives it, and one whose formalisation has materially changed is flagged instead of overwritten.",
  })
  @ApiBody({ type: StartRuleExtractionDto })
  @ApiPlatformErrors(ValidationErrors.FAILED)
  async start(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ProjectScopeQueryDto,
    @Body() dto: StartRuleExtractionDto
  ): Promise<never> {
    const scope = await this.checks.scopeIn({
      type: "project",
      projectId: query.projectId,
    });
    return await this.extractions.start(scope, principal, dto);
  }

  @Get()
  @ApiProjectScopeQuery()
  @RequirePermit("read")
  @ApiOperation({
    summary: "List extraction runs",
    description:
      "**Requires `read` on the project.** Runs newest first, with the phase each reached and what it produced.",
  })
  @ApiPaginationQueries(graphNodeList.pagination)
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ProjectScopeQueryDto
  ): Promise<never> {
    const scope = await this.scopeFor(query.projectId);
    return await this.extractions.list(
      scope,
      await this.checks.readableGroups(principal, scope)
    );
  }

  @Get("coverage")
  @ApiProjectScopeQuery()
  @RequirePermit("read")
  @ApiOperation({
    summary: "List source coverage",
    description:
      "**Requires `read` on the project.** Every unit of source text and what became of it — drafted, descriptive, administrative, qualitative, deferred, unresolved. One row per unit per run, so the denominator is the whole document rather than the part that worked. " +
      "This is the honest half of the report: what was *not* extracted, and why.",
  })
  @ApiPaginationQueries(graphNodeList.pagination)
  async coverage(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ProjectScopeQueryDto
  ): Promise<never> {
    const scope = await this.scopeFor(query.projectId);
    return await this.extractions.coverage(
      scope,
      await this.checks.readableGroups(principal, scope)
    );
  }

  @Get("vocabulary")
  @ApiProjectScopeQuery()
  @RequirePermit("read")
  @ApiOperation({
    summary: "Get the extraction vocabulary",
    description:
      "**Requires `read` on the project.** The canonical classes, the uses actually present in this project, and the property paths that are populated. " +
      "The grounding call: without it a model invents class names, and a measured run left 31% of its paths unresolvable.",
  })
  async vocabulary(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ProjectScopeQueryDto
  ): Promise<never> {
    const scope = await this.scopeFor(query.projectId);
    return await this.extractions.vocabulary(
      scope,
      await this.checks.readableGroups(principal, scope)
    );
  }

  // Declared after the two static children, because a route parameter matches
  // anything: `:runId` registered first would swallow `coverage`.
  @Get(":runId")
  @ApiPathParams("runId")
  @ApiOperation({
    summary: "Get an extraction run",
    description:
      "**Requires `read` on the project.** The phase, how many units are done of how many, and the findings that did not become rules: an unknown property path, a missing unit, a schema rejection, an anchor that did not resolve.",
  })
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param("runId") runId: string
  ): Promise<never> {
    return await this.extractions.findById(principal, runId);
  }

  /** The guard has already refused a caller who may not read here. */
  private scopeFor(projectId: string) {
    return this.checks.scopeIn({ type: "project", projectId });
  }
}

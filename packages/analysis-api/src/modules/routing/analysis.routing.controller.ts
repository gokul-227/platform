import {
  AuthorizationService,
  RequirePermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  type RoutingResponse,
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
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  ANALYSIS_ROUTING_RESPONSE_SCHEMA,
  RunAnalysisRoutingDto,
} from "./analysis.routing.dtos";
import { AnalysisRoutingService } from "./analysis.routing.service";

@ApiTags("Analysis")
@Controller("projects/:projectId/analysis/routing")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class AnalysisRoutingController {
  constructor(
    @Inject(AnalysisRoutingService)
    private readonly routing: AnalysisRoutingService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post()
  @ApiPathParams("projectId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Route between two spaces",
    description:
      "**Requires `read` on the project.** The shortest way from one space to another. Walks in the direction of travel, so a security door or a stair discharge modelled as a single arc is respected rather than escaped backwards through. Weighted by each passage's own `length` where it carries one; the answer says whether it is in metres or in hops, because only one of those settles a rule with a metric bound.",
  })
  @ApiResponse({ status: 200, schema: ANALYSIS_ROUTING_RESPONSE_SCHEMA })
  @ApiBody({ type: RunAnalysisRoutingDto })
  @RequirePermit("read")
  @ApiPlatformErrors(ValidationErrors.FAILED, GraphClientErrors.UNAVAILABLE)
  async analyse(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string,
    @Body() dto: RunAnalysisRoutingDto
  ): Promise<RoutingResponse> {
    return await this.routing.analyse(
      {
        projectId,
        readableGroups: await this.checks.readableGroups(principal, {
          orgId: null,
          projectId,
        }),
      },
      dto
    );
  }
}

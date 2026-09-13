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
  type EgressResponse,
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
  AnalysisEgressResponseDto,
  RunAnalysisEgressDto,
} from "./analysis.egress.dtos";
import { AnalysisEgressService } from "./analysis.egress.service";

@ApiTags("Analysis")
@Controller("projects/:projectId/analysis/egress")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class AnalysisEgressController {
  constructor(
    @Inject(AnalysisEgressService)
    private readonly egress: AnalysisEgressService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post()
  @ApiPathParams("projectId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Measure egress distances",
    description:
      "**Requires `read` on the project.** How far every space is from a way out. The number § 35 MBO compares against: travel distance from each space to its nearest exit, walked toward the exit, with the spaces that have no way out listed separately. Exits are named rather than guessed — a model marking none answers `exits: 0` and scores nothing, because a building nobody has told us about is not a building where everything fails.",
  })
  @ApiResponse({ status: 200, type: AnalysisEgressResponseDto })
  @ApiBody({ type: RunAnalysisEgressDto })
  @RequirePermit("read")
  @ApiPlatformErrors(ValidationErrors.FAILED, GraphClientErrors.UNAVAILABLE)
  async analyse(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string,
    @Body() dto: RunAnalysisEgressDto
  ): Promise<EgressResponse> {
    return await this.egress.analyse(
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

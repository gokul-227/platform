import {
  AuthorizationService,
  RequirePermit,
} from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import {
  type AdjacencyResponse,
  AuthenticationErrors,
  AuthorizationErrors,
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
  AnalysisAdjacencyResponseDto,
  RunAnalysisAdjacencyDto,
} from "./analysis.adjacency.dtos";
import { AnalysisAdjacencyService } from "./analysis.adjacency.service";

@ApiTags("Analysis")
@Controller("projects/:projectId/analysis/adjacency")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class AnalysisAdjacencyController {
  constructor(
    @Inject(AnalysisAdjacencyService)
    private readonly adjacency: AnalysisAdjacencyService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post()
  @ApiPathParams("projectId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Find adjacent spaces",
    description:
      "**Requires `read` on the project.** Which spaces share a boundary. Pairs of spaces joined by `adjacentTo`, which is a shared wall rather than a way through — treating it as passable is how a party wall becomes a doorway. What it is for is separation rather than movement: fire compartment boundaries, acoustic separation, clean against dirty. Pass `differingUseOnly` to keep only unlike neighbours, which is what those rules are about.",
  })
  @ApiResponse({ status: 200, type: AnalysisAdjacencyResponseDto })
  @ApiBody({ type: RunAnalysisAdjacencyDto })
  @RequirePermit("read")
  @ApiPlatformErrors(ValidationErrors.FAILED, GraphClientErrors.UNAVAILABLE)
  async analyse(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string,
    @Body() dto: RunAnalysisAdjacencyDto
  ): Promise<AdjacencyResponse> {
    return await this.adjacency.analyse(
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

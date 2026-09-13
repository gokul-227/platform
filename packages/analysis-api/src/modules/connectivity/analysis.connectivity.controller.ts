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
  type ConnectivityResponse,
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
  ANALYSIS_CONNECTIVITY_RESPONSE_SCHEMA,
  RunAnalysisConnectivityDto,
} from "./analysis.connectivity.dtos";
import { AnalysisConnectivityService } from "./analysis.connectivity.service";

@ApiTags("Analysis")
@Controller("projects/:projectId/analysis/connectivity")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class AnalysisConnectivityController {
  constructor(
    @Inject(AnalysisConnectivityService)
    private readonly connectivity: AnalysisConnectivityService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post()
  @ApiPathParams("projectId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Check space connectivity",
    description:
      "**Requires `read` on the project.** Can you walk between every space. Answers whether the spaces all reach each other through modelled passages. When they do not, it returns the node ids island by island, largest first, and how many sit outside the largest: a space you cannot walk into is almost always a door that was never modelled rather than a real island. " +
      "Spaces only, and `connectsTo` only, neither of them a parameter: a storey is a container rather than something you pass through, and walking `adjacentTo` instead would treat a party wall as a doorway. Pass `parentId` to ask about one storey, which then reports two wings joined only through another floor as two islands. " +
      "Answered from the projection, so results trail writes by the sync lag, and rows are restricted to what the caller may read, inside the query rather than after it.",
  })
  @ApiBody({ type: RunAnalysisConnectivityDto })
  @RequirePermit("read")
  @ApiResponse({ status: 200, schema: ANALYSIS_CONNECTIVITY_RESPONSE_SCHEMA })
  @ApiPlatformErrors(ValidationErrors.FAILED, GraphClientErrors.UNAVAILABLE)
  async analyse(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string,
    @Body() dto: RunAnalysisConnectivityDto
  ): Promise<ConnectivityResponse> {
    return await this.connectivity.analyse(
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

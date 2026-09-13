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
  type ChokepointsResponse,
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
  AnalysisChokepointsResponseDto,
  RunAnalysisChokepointsDto,
} from "./analysis.chokepoints.dtos";
import { AnalysisChokepointsService } from "./analysis.chokepoints.service";

@ApiTags("Analysis")
@Controller("projects/:projectId/analysis/chokepoints")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class AnalysisChokepointsController {
  constructor(
    @Inject(AnalysisChokepointsService)
    private readonly chokepoints: AnalysisChokepointsService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post()
  @ApiPathParams("projectId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Find circulation chokepoints",
    description:
      "**Requires `read` on the project.** Where circulation depends on a single passage or space. Returns the passages and spaces that cannot be routed around, worst first, each with how many spaces end up stranded without it. Not the same question as connectivity: that asks whether the building is one piece now, this asks whether it is still one piece if one thing fails. Rooms off a corridor are fully connected and every one of them depends on that corridor. Deterministic rather than probabilistic — it reports that a single-point dependency exists, never how likely it is to be exercised, which is why fire code treats the dependency as certain and requires a second escape route.",
  })
  @ApiResponse({ status: 200, type: AnalysisChokepointsResponseDto })
  @ApiBody({ type: RunAnalysisChokepointsDto })
  @RequirePermit("read")
  @ApiPlatformErrors(ValidationErrors.FAILED, GraphClientErrors.UNAVAILABLE)
  async analyse(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string,
    @Body() dto: RunAnalysisChokepointsDto
  ): Promise<ChokepointsResponse> {
    return await this.chokepoints.analyse(
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

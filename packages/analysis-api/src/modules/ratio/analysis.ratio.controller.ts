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
  type RatioResponse,
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
  AnalysisRatioResponseDto,
  RunAnalysisRatioDto,
} from "./analysis.ratio.dtos";
import { AnalysisRatioService } from "./analysis.ratio.service";

/** `/projects/:projectId/analysis/ratio` */
@ApiTags("Analysis")
@Controller("projects/:projectId/analysis/ratio")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class AnalysisRatioController {
  constructor(
    @Inject(AnalysisRatioService) private readonly ratio: AnalysisRatioService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post()
  @ApiPathParams("projectId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Compare two quantities",
    description:
      "**Requires `read` on the project.** One quantity over another. Takes two query specs and divides the first by the second: net to gross, circulation share, occupancy density, glazed area against floor area. " +
      "Both operands come back with the answer, because a null ratio has three causes — no numerator, no denominator, a denominator of zero — and they are not the same finding. " +
      "Answered from Postgres, and rows are restricted to what the caller may read, inside each query rather than after it.",
  })
  @ApiResponse({ status: 200, type: AnalysisRatioResponseDto })
  @ApiBody({ type: RunAnalysisRatioDto })
  @RequirePermit("read")
  @ApiPlatformErrors(ValidationErrors.FAILED)
  async analyse(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string,
    @Body() dto: RunAnalysisRatioDto
  ): Promise<RatioResponse> {
    return await this.ratio.analyse(
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

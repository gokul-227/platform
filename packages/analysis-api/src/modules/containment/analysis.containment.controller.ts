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
  type ContainmentResponse,
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
  AnalysisContainmentResponseDto,
  RunAnalysisContainmentDto,
} from "./analysis.containment.dtos";
import { AnalysisContainmentService } from "./analysis.containment.service";

@ApiTags("Analysis")
@Controller("projects/:projectId/analysis/containment")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class AnalysisContainmentController {
  constructor(
    @Inject(AnalysisContainmentService)
    private readonly containment: AnalysisContainmentService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post()
  @ApiPathParams("projectId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Check the spatial tree",
    description:
      "**Requires `read` on the project.** Whether the spatial tree holds. Finds nodes with no container and nodes contained by more than one. A defect check rather than a finding about the building: a space belonging to no storey is an import that lost the relation, and every rollup downstream is silently wrong until it is fixed. Containment is expressed as `parentId` and as a `contains` edge, and an importer may use either, so an orphan is a node with neither.",
  })
  @ApiResponse({ status: 200, type: AnalysisContainmentResponseDto })
  @ApiBody({ type: RunAnalysisContainmentDto })
  @RequirePermit("read")
  @ApiPlatformErrors(ValidationErrors.FAILED, GraphClientErrors.UNAVAILABLE)
  async analyse(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string,
    @Body() dto: RunAnalysisContainmentDto
  ): Promise<ContainmentResponse> {
    return await this.containment.analyse(
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

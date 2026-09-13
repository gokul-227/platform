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
  type QuantityResponse,
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
  ANALYSIS_QUANTITY_RESPONSE_SCHEMA,
  RunAnalysisQuantityDto,
} from "./analysis.quantity.dtos";
import { AnalysisQuantityService } from "./analysis.quantity.service";

@ApiTags("Analysis")
@Controller("projects/:projectId/analysis/quantity")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class AnalysisQuantityController {
  constructor(
    @Inject(AnalysisQuantityService)
    private readonly quantity: AnalysisQuantityService,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {}

  @Post()
  @ApiPathParams("projectId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Total a field over a class",
    description:
      "**Requires `read` on the project.** Count or total any field over a class. Takes a query spec — a class, ANDed predicates, an aggregate, an optional grouping — and answers with one number, or with `{group, value}` rows when a grouping is given. " +
      "A rule whose measure is a property path resolves through this, so one route answers the whole dimensional family; named quantities like “net floor area” are presets over this body rather than routes of their own. " +
      "Answered from Postgres, so it reads the row that was committed rather than a projection that trails it, and rows are restricted to what the caller may read, inside the query rather than after it.",
  })
  @ApiResponse({ status: 200, schema: ANALYSIS_QUANTITY_RESPONSE_SCHEMA })
  @ApiBody({ type: RunAnalysisQuantityDto })
  @RequirePermit("read")
  @ApiPlatformErrors(ValidationErrors.FAILED)
  async analyse(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string,
    @Body() dto: RunAnalysisQuantityDto
  ): Promise<QuantityResponse> {
    return await this.quantity.analyse(
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

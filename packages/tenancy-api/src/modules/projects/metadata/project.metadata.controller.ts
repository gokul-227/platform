import { RequirePermit } from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type { ProjectResponse } from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
  AuthorizationErrors,
  InternalErrors,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  CurrentPrincipal,
  type Principal,
} from "@aec-craft/platform-id-resource-nestjs";
import { SetMetadataDto } from "@aec-craft/platform-metadata";
import { Body, Controller, Delete, Inject, Param, Put } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ProjectResponseDto } from "../project.dtos";
import { ProjectErrors } from "../project.errors";
import { ProjectMetadataService } from "./project.metadata.service";

/** The only path to the bag: `PATCH /projects/:projectId` cannot touch it. */
@ApiTags("Projects")
@Controller("projects")
@RequirePermit("manage")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class ProjectMetadataController {
  constructor(
    @Inject(ProjectMetadataService)
    private readonly metadata: ProjectMetadataService
  ) {}

  @Put(":projectId/metadata/:keyPath")
  @ApiPathParams("projectId", "keyPath")
  @ApiOperation({
    summary: "Set a project metadata key",
    description:
      "**Requires `manage` on the project.** Merge-write a single key into the project's metadata bag. The value at the dotted key path is replaced; sibling keys are preserved. The bag is free-form and stored as-is — no key schema is enforced. Missing parents are created. Apps namespace their settings under `apps.<appId>.*` to avoid collisions.",
  })
  @ApiResponse({ status: 200, type: ProjectResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    AuthorizationErrors.FORBIDDEN,
    ProjectErrors.NOT_FOUND
  )
  set(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string,
    @Param("keyPath") keyPath: string,
    @Body() dto: SetMetadataDto
  ): Promise<ProjectResponse> {
    return this.metadata.set(projectId, keyPath, dto.value, principal);
  }

  @Delete(":projectId/metadata/:keyPath")
  @ApiPathParams("projectId", "keyPath")
  @ApiOperation({
    summary: "Delete a project metadata key",
    description:
      "**Requires `manage` on the project.** Remove a single key from the project's metadata bag. Deleting a key that doesn't exist is a no-op.",
  })
  @ApiResponse({ status: 200, type: ProjectResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    AuthorizationErrors.FORBIDDEN,
    ProjectErrors.NOT_FOUND
  )
  delete(
    @CurrentPrincipal() principal: Principal,
    @Param("projectId") projectId: string,
    @Param("keyPath") keyPath: string
  ): Promise<ProjectResponse> {
    return this.metadata.delete(projectId, keyPath, principal);
  }
}

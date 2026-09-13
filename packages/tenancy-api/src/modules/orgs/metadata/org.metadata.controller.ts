import { RequirePermit } from "@aec-craft/platform-authorization/nest";
import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type { OrgResponse } from "@aec-craft/platform-contracts";
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
import { OrgResponseDto } from "../org.dtos";
import { OrgErrors } from "../org.errors";
import { OrgMetadataService } from "./org.metadata.service";

/** The only path to the bag: `PATCH /orgs/:orgId` cannot touch it. */
@ApiTags("Orgs")
@Controller("orgs")
@RequirePermit("manage")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  AuthorizationErrors.FORBIDDEN,
  InternalErrors.UNEXPECTED
)
export class OrgMetadataController {
  constructor(
    @Inject(OrgMetadataService) private readonly metadata: OrgMetadataService
  ) {}

  @Put(":orgId/metadata/:keyPath")
  @ApiPathParams("orgId", "keyPath")
  @ApiOperation({
    summary: "Set an organization metadata key",
    description:
      "**Requires `manage` on the organization.** Merge-write a single key into the organization's metadata bag. The value at the dotted key path is replaced; sibling keys are preserved. The bag is free-form and stored as-is — no key schema is enforced. Missing parents are created. Apps namespace their settings under `apps.<appId>.*` to avoid collisions.",
  })
  @ApiResponse({ status: 200, type: OrgResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    AuthorizationErrors.FORBIDDEN,
    OrgErrors.NOT_FOUND
  )
  set(
    @CurrentPrincipal() principal: Principal,
    @Param("orgId") orgId: string,
    @Param("keyPath") keyPath: string,
    @Body() dto: SetMetadataDto
  ): Promise<OrgResponse> {
    return this.metadata.set(orgId, keyPath, dto.value, principal);
  }

  @Delete(":orgId/metadata/:keyPath")
  @ApiPathParams("orgId", "keyPath")
  @ApiOperation({
    summary: "Delete an organization metadata key",
    description:
      "**Requires `manage` on the organization.** Remove a single key from the organization's metadata bag. Deleting a key that doesn't exist is a no-op.",
  })
  @ApiResponse({ status: 200, type: OrgResponseDto })
  @ApiPlatformErrors(
    ValidationErrors.FAILED,
    AuthorizationErrors.FORBIDDEN,
    OrgErrors.NOT_FOUND
  )
  delete(
    @CurrentPrincipal() principal: Principal,
    @Param("orgId") orgId: string,
    @Param("keyPath") keyPath: string
  ): Promise<OrgResponse> {
    return this.metadata.delete(orgId, keyPath, principal);
  }
}

import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import type { UserResponse } from "@aec-craft/platform-contracts";
import {
  AuthenticationErrors,
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
import { UserResponseDto } from "../../user.dtos";
import { UserErrors } from "../../user.errors";
import { MeMetadataService } from "./me.metadata.service";

/** The only path to the caller's metadata bag: `PATCH /me` cannot touch it. */
@ApiTags("Me")
@Controller("me")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  InternalErrors.UNEXPECTED
)
export class MeMetadataController {
  constructor(
    @Inject(MeMetadataService) private readonly metadata: MeMetadataService
  ) {}

  @Put("metadata/:keyPath")
  @ApiPathParams("keyPath")
  @ApiOperation({
    summary: "Set a metadata key",
    description:
      "**Requires sign-in.** Merge-write a single key into your metadata bag. The value at the dotted key path is replaced; sibling keys are preserved. The bag is free-form and stored as-is — no key schema is enforced. Missing parents are created. Apps namespace their settings under `apps.<appId>.*` to avoid collisions.",
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, UserErrors.NOT_FOUND)
  set(
    @CurrentPrincipal() principal: Principal,
    @Param("keyPath") keyPath: string,
    @Body() dto: SetMetadataDto
  ): Promise<UserResponse> {
    return this.metadata.set(principal, keyPath, dto.value);
  }

  @Delete("metadata/:keyPath")
  @ApiPathParams("keyPath")
  @ApiOperation({
    summary: "Delete a metadata key",
    description:
      "**Requires sign-in.** Remove a single key from your metadata bag. Deleting a key that doesn't exist is a no-op.",
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, UserErrors.NOT_FOUND)
  delete(
    @CurrentPrincipal() principal: Principal,
    @Param("keyPath") keyPath: string
  ): Promise<UserResponse> {
    return this.metadata.delete(principal, keyPath);
  }
}

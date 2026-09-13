import { ApiPlatformErrors } from "@aec-craft/platform-common/nest";
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
import { Body, Controller, Get, Inject, Patch } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { UpdateUserDto, UserResponseDto } from "../user.dtos";
import { UserErrors } from "../user.errors";
import { MeService } from "./me.service";

/**
 * The caller acting on their own row. Deleting an account is the identity
 * provider's, through the webhook; metadata is a submodule of its own.
 */
@ApiTags("Me")
@Controller("me")
@ApiBearerAuth("bearer")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  InternalErrors.UNEXPECTED
)
export class MeController {
  constructor(@Inject(MeService) private readonly me: MeService) {}

  @Get()
  @ApiOperation({
    summary: "Get my profile",
    description:
      "**Requires sign-in.** Returns the profile of the currently signed-in user.",
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiPlatformErrors(UserErrors.NOT_FOUND)
  get(@CurrentPrincipal() principal: Principal): Promise<UserResponse> {
    return this.me.get(principal);
  }

  @Patch()
  @ApiOperation({
    summary: "Update my profile",
    description:
      "**Requires sign-in.** Update your avatar. Your name and email belong to your identity rather than to this profile: change them on your sign-in provider's account page and they arrive here through its webhook. Role is an administrator's to set. Metadata is written through `PUT /me/metadata/:keyPath`, not here.",
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiPlatformErrors(ValidationErrors.FAILED, UserErrors.NOT_FOUND)
  update(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: UpdateUserDto
  ): Promise<UserResponse> {
    return this.me.update(principal, dto);
  }
}

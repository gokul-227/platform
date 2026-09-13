import {
  ApiPathParams,
  ApiPlatformErrors,
} from "@aec-craft/platform-common/nest";
import {
  AuthenticationErrors,
  InternalErrors,
} from "@aec-craft/platform-contracts";
import { Public } from "@aec-craft/platform-id-resource-nestjs";
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiExcludeController,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { UserErrors } from "../../user.errors";
import { UserService } from "../../user.service";
import { UpsertIdentityDto } from "./identity.webhook.dtos";
import { IdentityWebhookGuard } from "./identity.webhook.guard";

/**
 * Kratos fires the upsert from its after-registration and after-settings hooks.
 * Deleting an identity is an admin API call rather than a flow, so the console
 * makes that call and then this one.
 *
 * A shared secret, not a token: a registration hook fires before the person has
 * a session at all.
 */
@Controller("webhooks/identity")
// Opts out of the global principal guard: without it the guard verifies the
// shared secret as a JWT and fails before `IdentityWebhookGuard` runs.
@Public()
@UseGuards(IdentityWebhookGuard)
@ApiExcludeController()
@ApiSecurity("identity-webhook")
@ApiTags("Webhooks")
@ApiPlatformErrors(
  AuthenticationErrors.PRINCIPAL_REQUIRED,
  InternalErrors.UNEXPECTED
)
export class IdentityWebhookController {
  constructor(@Inject(UserService) private readonly users: UserService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Create or refresh a platform profile from an identity",
    description:
      "Fired by Kratos after registration and after a settings change. Idempotent on `externalId`: the second call updates the profile rather than failing, which is what makes one hook serve both events.",
  })
  @ApiResponse({ status: 204, description: "Profile created or refreshed" })
  async upsert(@Body() dto: UpsertIdentityDto): Promise<void> {
    await this.users.upsertByExternalId({
      externalId: dto.externalId,
      email: dto.email,
      ...(dto.name === undefined ? {} : { name: dto.name }),
    });
  }

  @Delete(":externalId")
  @ApiPathParams("externalId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove the platform profile for a deleted identity",
    description:
      "Called by the staff console after it deletes the identity. Idempotent: an identity with no profile is a no-op. Refused while the person is the only owner of a group, so the console can say what has to be handed over first.",
  })
  @ApiResponse({ status: 204, description: "Profile removed, or already gone" })
  @ApiPlatformErrors(UserErrors.DELETE_BLOCKED_LAST_OWNER)
  async remove(@Param("externalId") externalId: string): Promise<void> {
    await this.users.deleteByExternalId(externalId);
  }
}

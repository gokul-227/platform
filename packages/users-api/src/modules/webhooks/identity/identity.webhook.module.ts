import { Module } from "@nestjs/common";

import { UserModule } from "../../user.module";

import { IdentityWebhookController } from "./identity.webhook.controller";
import { IdentityWebhookGuard } from "./identity.webhook.guard";

/**
 * The identity provider's back-channel. Exports the guard so a second webhook
 * surface shares the shared-secret check rather than copying it.
 */
@Module({
  imports: [UserModule],
  controllers: [IdentityWebhookController],
  providers: [IdentityWebhookGuard],
  exports: [IdentityWebhookGuard],
})
export class IdentityWebhookModule {}

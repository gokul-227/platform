import { type DynamicModule, Global, Module } from "@nestjs/common";

import { PrincipalUserService } from "../common/principal.user.service";
import { DatabaseModule } from "../database/database.module";
import { MeModule } from "../modules/me/me.module";
import { UserModule } from "../modules/user.module";
import { IdentityWebhookModule } from "../modules/webhooks/identity/identity.webhook.module";

import { type ConfigInput, ConfigToken, parseConfig } from "./config";

/**
 * Requires `AuthorizationModule`, which is what makes `@RequirePermit` work.
 *
 * Without `identityWebhookSecret` the identity hook is fail-closed: every call is
 * rejected, no user row is written, and authenticated callers then fail
 * `ACCESS_PRINCIPAL_NOT_PROVISIONED`.
 */
@Global()
@Module({})
export class UsersApiModule {
  static forRoot(input: ConfigInput): DynamicModule {
    const config = parseConfig(input);
    return {
      module: UsersApiModule,
      imports: [DatabaseModule, UserModule, MeModule, IdentityWebhookModule],
      providers: [
        { provide: ConfigToken, useValue: config },
        // Global: `/me` and the metadata bags resolve the caller's row through it.
        PrincipalUserService,
      ],
      exports: [
        ConfigToken,
        DatabaseModule,
        UserModule,
        MeModule,
        IdentityWebhookModule,
        PrincipalUserService,
      ],
    };
  }
}

import { type DynamicModule, Global, Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthorizationService } from "./authorization.service";
import { AuthorizationCacheInterceptor } from "./cache";
import {
  type Config,
  type ConfigInput,
  ConfigToken,
  parseConfig,
} from "./config/config";
import { DatabaseModule } from "./database/database.module";
import { RowPermitGuard } from "./guards/row.permit.guard";
import { ScopePermitGuard } from "./guards/scope.permit.guard";
import { StaffGuard } from "./guards/staff.guard";
import { KetoClient } from "./keto/keto.client";

/**
 * Root module, embedded in a host app. Global: every package's services call the
 * check surface and none should have to import a module to do it.
 *
 * Registers the cache interceptor app-wide, so every request gets its own memo,
 * and `ScopePermitGuard`, so `@RequirePermit` works on any controller in the host.
 *
 * The write path is not here. Granting a standing needs the escalation guard and
 * the audit row, both rules about who may join rather than who may act, so they
 * live with the member surface in tenancy-api.
 */
@Global()
@Module({})
export class AuthorizationModule {
  static forRoot(input: ConfigInput): DynamicModule {
    const config = parseConfig(input);
    return {
      module: AuthorizationModule,
      imports: [DatabaseModule],
      providers: [
        { provide: ConfigToken, useValue: config },
        {
          // Built once for the process. It holds the identity-token cache, so
          // one per request would mint a Google token on every call.
          provide: KetoClient,
          inject: [ConfigToken],
          useFactory: (resolved: Config) =>
            new KetoClient({
              readUrl: resolved.ketoReadUrl,
              writeUrl: resolved.ketoWriteUrl,
              identityTokens: resolved.ketoIdentityTokens,
              timeoutMs: resolved.ketoTimeoutMs,
            }),
        },
        AuthorizationService,
        StaffGuard,
        ScopePermitGuard,
        RowPermitGuard,
        { provide: APP_INTERCEPTOR, useClass: AuthorizationCacheInterceptor },
        { provide: APP_GUARD, useClass: ScopePermitGuard },
        { provide: APP_GUARD, useClass: RowPermitGuard },
      ],
      exports: [
        ConfigToken,
        DatabaseModule,
        KetoClient,
        AuthorizationService,
        StaffGuard,
        ScopePermitGuard,
        RowPermitGuard,
      ],
    };
  }
}

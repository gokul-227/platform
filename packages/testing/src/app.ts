import { AdminApiModule } from "@aec-craft/platform-admin-api/nest";
import { AnalysisApiModule } from "@aec-craft/platform-analysis-api/nest";
import { AuditApiModule } from "@aec-craft/platform-audit-api/nest";
import { AuthorizationModule } from "@aec-craft/platform-authorization/nest";
import { PlatformExceptionFilter } from "@aec-craft/platform-common/nest";
import { FilesApiModule } from "@aec-craft/platform-files-api/nest";
import { GraphApiModule } from "@aec-craft/platform-graph-api/nest";
import { ObjectsApiModule } from "@aec-craft/platform-objects-api/nest";
import { OrgErrors, ProjectErrors } from "@aec-craft/platform-tenancy-api";
import { TenancyApiModule } from "@aec-craft/platform-tenancy-api/nest";
import { ThreadsApiModule } from "@aec-craft/platform-threads-api/nest";
import { UsersApiModule } from "@aec-craft/platform-users-api/nest";
import {
  type INestApplication,
  type MiddlewareConsumer,
  Module,
  type ModuleMetadata,
  type NestModule,
} from "@nestjs/common";
import { APP_GUARD, APP_PIPE, DiscoveryModule } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ZodValidationPipe } from "nestjs-zod";

import { dbUrl } from "./db";
import { TestPrincipalGuard } from "./test-principal.guard";
import { TestPrincipalMiddleware } from "./test-principal.middleware";

/**
 * Minimal consuming-app module for end-to-end tests. Mirrors what a real
 * deployable does:
 *
 *   - Mounts the same API packages the real host binds, with the test `DATABASE_URL`.
 *   - Applies `TestPrincipalMiddleware` so a test can act as somebody through
 *     `X-Test-Subject`, standing in for the access token the real host
 *     verifies.
 *   - Registers `ZodValidationPipe` the same way, as `APP_PIPE`. Without it
 *     every request here reached its handler unvalidated, which is a different
 *     application from the one being tested and hid the fault that
 *     `validation.wiring` now covers.
 *
 * `DiscoveryModule` is imported so a test can enumerate the bound controllers
 * rather than restate a list of them. A host's own modules (`HealthModule`) are
 * passed to `bootstrapTestApp` instead, because this package cannot import an
 * app.
 */
@Module({
  imports: [
    AuthorizationModule.forRoot({
      masks: {
        org: OrgErrors.NOT_FOUND,
        project: ProjectErrors.NOT_FOUND,
      },
      databaseUrl: dbUrl(),
      ketoReadUrl: process.env.KETO_READ_URL ?? "http://localhost:4466",
      ketoWriteUrl: process.env.KETO_WRITE_URL ?? "http://localhost:4467",
      ketoIdentityTokens: false,
    }),
    // Mirrors the real host: orgs, projects and the group tree in one package,
    // the people behind the subjects in another.
    TenancyApiModule.forRoot({ databaseUrl: dbUrl() }),
    UsersApiModule.forRoot({ databaseUrl: dbUrl() }),
    GraphApiModule.forRoot({ databaseUrl: dbUrl() }),
    // No `fileStorage`: byte operations answer 503 and the tree still works,
    // which is the half a test without a bucket can exercise.
    FilesApiModule.forRoot({ databaseUrl: dbUrl() }),
    // The read side of what the other slices write: an event recorded and then
    // unreadable is the failure worth a test, and it needs the feed mounted.
    AuditApiModule.forRoot({ databaseUrl: dbUrl() }),
    // No `llm` config: the run worker stays dormant, runs sit `queued` —
    // exactly the shape the run-lifecycle tests document.
    ThreadsApiModule.forRoot({ databaseUrl: dbUrl() }),
    // Configless, and bound for the same reason the rest are: a package absent
    // here is a package `validation.wiring` cannot see, which is how three of
    // them went unvalidated. Every API package the host binds belongs here.
    AnalysisApiModule,
    ObjectsApiModule,
    AdminApiModule,
    DiscoveryModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: TestPrincipalGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class TestAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TestPrincipalMiddleware).forRoutes("*");
  }
}

/**
 * Boot the full Nest app on an ephemeral port. Returns the running
 * `INestApplication` plus a `baseUrl` callers can fetch against.
 */
export async function bootstrapTestApp(
  options: { imports?: ModuleMetadata["imports"]; port?: number } = {}
): Promise<{
  app: INestApplication;
  baseUrl: string;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [TestAppModule, ...(options.imports ?? [])],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalFilters(new PlatformExceptionFilter());

  await app.init();
  // A random port unless the caller names one. The MCP endpoint dispatches back
  // to itself over loopback at `PORT`, so exercising it needs a port known
  // before the app is constructed.
  await app.listen(options.port ?? 0);
  const url = await app.getUrl();
  // Nest occasionally returns [::1] which fails on some networks; force IPv4.
  const baseUrl = url.replace("[::1]", "127.0.0.1");
  return { app: wrapClose(app), baseUrl };
}

/**
 * Historical shim, now a pass-through: `DatabaseModule.onApplicationShutdown`
 * used to end the pg.Pool twice ("Called end on pool more than once" on
 * every close); it ends it exactly once now. Kept as a seam in
 * case teardown ever needs special-casing again.
 */
function wrapClose(app: INestApplication): INestApplication {
  return app;
}

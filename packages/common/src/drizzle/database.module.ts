import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
  type Provider,
  type Type,
} from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

export interface DrizzleDatabaseModuleOptions {
  /** DI token of the package config; its value must carry `databaseUrl`. */
  configToken: symbol;
  /** DI token the drizzle instance is provided under. */
  databaseToken: symbol;
  /** Pool size; default 20. */
  poolMax?: number;
  /** DI token the raw `pg.Pool` is provided under (shutdown + direct consumers). */
  poolToken: symbol;
  /** The package's drizzle schema (`import * as schema from "./schema"`). */
  schema: Record<string, unknown>;
}

/**
 * The one `DatabaseModule` every drizzle-backed API package binds: a `pg.Pool`
 * from the package config's `databaseUrl`, a drizzle instance over the
 * package's schema, and pool teardown on application shutdown. `@Global()` so
 * the package's feature modules resolve the tokens without re-importing.
 *
 * Tokens are caller-owned `Symbol.for(...)` values so each package keeps its
 * own identity when several packages share one host.
 */
export function createDrizzleDatabaseModule(
  options: DrizzleDatabaseModuleOptions
): Type<OnApplicationShutdown> {
  const providers: Provider[] = [
    {
      provide: options.poolToken,
      inject: [options.configToken],
      useFactory: (config: { databaseUrl: string }): pg.Pool =>
        new pg.Pool({
          connectionString: config.databaseUrl,
          max: options.poolMax ?? 20,
          idleTimeoutMillis: 30_000,
        }),
    },
    {
      provide: options.databaseToken,
      inject: [options.poolToken],
      useFactory: (pool: pg.Pool) => drizzle(pool, { schema: options.schema }),
    },
  ];

  @Global()
  @Module({
    providers,
    exports: [options.databaseToken, options.poolToken],
  })
  class DatabaseModule implements OnApplicationShutdown {
    constructor(@Inject(options.poolToken) private readonly pool: pg.Pool) {}

    async onApplicationShutdown(): Promise<void> {
      await this.pool.end();
    }
  }
  return DatabaseModule;
}

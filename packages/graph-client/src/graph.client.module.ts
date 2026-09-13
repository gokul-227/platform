import {
  type DynamicModule,
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { auth, driver as createDriver, type Driver } from "neo4j-driver";

import { type GraphClientConfigInput, graphClientConfigSchema } from "./config";
import { type GraphDialect, MemgraphDialect, Neo4jDialect } from "./dialect";
import { ProjectionSessionService } from "./session";
import { GraphDialectToken, GraphDriverToken } from "./tokens";

/**
 * Global and always registered, so the routes that read the projection exist on
 * every deployment. Called without a connection the driver token resolves to
 * null, every read answers `GRAPH_UNAVAILABLE`, and nothing else changes:
 * Postgres is the source of truth and the projection is derived.
 *
 * `neo4j-driver` is the one client for both engines, and auth is attached only
 * when a username is configured; local Memgraph is authless.
 *
 * The idempotent index DDL runs once at bootstrap. A failure is logged rather
 * than fatal, because the projection is rebuildable and the worker retries.
 */
@Global()
@Module({})
export class GraphClientModule
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(GraphClientModule.name);

  constructor(
    @Inject(GraphDriverToken) private readonly driver: Driver | null,
    @Inject(GraphDialectToken) private readonly dialect: GraphDialect
  ) {}

  static forRoot(input?: GraphClientConfigInput): DynamicModule {
    const config = input ? graphClientConfigSchema.parse(input) : null;
    return {
      module: GraphClientModule,
      providers: [
        {
          provide: GraphDriverToken,
          useFactory: (): Driver | null => {
            if (!config) {
              return null;
            }
            return config.username === undefined
              ? createDriver(config.uri)
              : createDriver(
                  config.uri,
                  auth.basic(config.username, config.password ?? "")
                );
          },
        },
        {
          provide: GraphDialectToken,
          useFactory: (): GraphDialect =>
            config?.engine === "neo4j"
              ? new Neo4jDialect()
              : new MemgraphDialect(),
        },
        ProjectionSessionService,
      ],
      exports: [GraphDialectToken, GraphDriverToken, ProjectionSessionService],
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.driver) {
      return;
    }
    const session = this.driver.session();
    try {
      for (const statement of this.dialect.bootstrapStatements()) {
        try {
          await session.run(statement.text, statement.params);
        } catch (error) {
          // Memgraph errors on re-creating an index instead of no-opping.
          this.logger.warn(
            `graph bootstrap statement failed (continuing): ${statement.text.trim()} - ${String(error)}`
          );
        }
      }
    } finally {
      await session.close();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.driver?.close();
  }
}

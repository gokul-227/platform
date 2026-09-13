import { GraphDriverToken } from "@aec-craft/platform-graph-client";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { Driver } from "neo4j-driver";
import { type Config, ConfigToken } from "../../config/config";
import { type Database, DatabaseToken } from "../../database/database.module";
import { GraphVersionService } from "../versions/graph.version.service";

import { toCypherStatements } from "./cypher";

const TICK_MS = 500;
const BATCH_SIZE = 100;

/**
 * Tails `graph_version` and applies each batch to the graph database. A
 * self-rescheduling timeout chain rather than `@nestjs/schedule`, which is not a
 * dependency and whose fixed ticks can overlap under slow batches.
 *
 * One Postgres transaction claims a batch with `FOR UPDATE SKIP LOCKED`, so
 * instances cooperate, runs the Cypher in one bolt write transaction, then marks
 * the rows synced. A crash before the commit unlocks them unmarked and the next
 * tick re-emits, which converges because the Cypher is idempotent.
 *
 * 100 events per 500ms tick drains a 10k-node import in under a minute. The
 * per-batch log line is the SLO surface; the lag target is p99 under 5s.
 */
@Injectable()
export class GraphSyncWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(GraphSyncWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<unknown> | undefined;
  private stopped = false;

  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(GraphDriverToken) private readonly driver: Driver | null,
    @Inject(ConfigToken) private readonly config: Config,
    @Inject(GraphVersionService) private readonly versions: GraphVersionService
  ) {}

  onApplicationBootstrap(): void {
    // Dormant without a graph database: the feed accumulates until one exists.
    if (this.driver && this.config.graphDatabase?.syncEnabled) {
      this.logger.log(
        `graph sync worker starting (tick ${TICK_MS}ms, batch ${BATCH_SIZE})`
      );
      this.schedule();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    await this.inFlight;
  }

  private schedule(): void {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => {
      this.inFlight = this.tick()
        .catch((error: unknown) => {
          this.logger.error(`graph sync tick failed: ${String(error)}`);
        })
        .finally(() => {
          this.schedule();
        });
    }, TICK_MS);
  }

  /** One claim-project-mark cycle. Public so tests can drive it directly. */
  async tick(): Promise<number> {
    const driver = this.driver;
    if (!driver) {
      return 0;
    }
    return await this.db.transaction(async (trx) => {
      const events = await this.versions.claimUnsynced(trx, BATCH_SIZE);
      if (events.length === 0) {
        return 0;
      }

      const statements = events.flatMap((event) => toCypherStatements(event));
      const started = Date.now();
      const session = driver.session();
      try {
        await session.executeWrite(async (tx) => {
          for (const statement of statements) {
            await tx.run(statement.text, statement.params);
          }
        });
      } finally {
        await session.close();
      }

      await this.versions.markSynced(
        trx,
        events.map((event) => event.seq)
      );

      const oldest = events[0]?.createdAt;
      this.logger.log(
        `graph sync batch: events=${events.length} cypherMs=${Date.now() - started} lagMsOldest=${
          oldest ? Date.now() - oldest.getTime() : 0
        }`
      );
      return events.length;
    });
  }
}

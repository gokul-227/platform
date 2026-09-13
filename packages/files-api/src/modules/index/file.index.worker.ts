import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import { type Config, ConfigToken } from "../../config/config";

import { FileIndexService } from "./file.index.service";

const TICK_MS = 10_000;

/**
 * Claims submitted documents, extracts, embeds and upserts them, and retries the
 * vector purges whose tombstones outlived an outage. A self-rescheduling timeout
 * chain, so a long pass cannot overlap the next, and dormant with no index.
 * TODO(#124): move to the worker deployable; where `min_instances` is 0 a
 * document submitted by the last request waits for the next one.
 */
@Injectable()
export class FileIndexWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(FileIndexWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<unknown> | undefined;
  private isStopped = false;

  constructor(
    @Inject(FileIndexService) private readonly index: FileIndexService,
    @Inject(ConfigToken) private readonly config: Config
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.documentIndex) {
      return;
    }
    this.schedule();
  }

  async onApplicationShutdown(): Promise<void> {
    this.isStopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    // Let an in-flight pass finish, so a document is not left claimed as
    // `processing` with nothing running behind it.
    await this.inFlight?.catch(() => undefined);
  }

  private schedule(): void {
    if (this.isStopped) {
      return;
    }
    this.timer = setTimeout(() => {
      this.inFlight = this.tick().finally(() => {
        this.inFlight = undefined;
        this.schedule();
      });
    }, TICK_MS);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    try {
      const ingested = await this.index.ingestPending();
      if (ingested > 0) {
        this.logger.log(`Indexed ${ingested} document(s)`);
      }
      const purged = await this.index.retryPurges();
      if (purged > 0) {
        this.logger.log(`Purged vectors for ${purged} deleted file(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Index worker pass failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import { type Config, ConfigToken } from "../config/config";
import { FileService } from "./file.service";
import { type FileStorage, FileStorageToken } from "./storage/file.storage";

const TICK_MS = 60_000;

/**
 * Without it a paused upload nobody returns to holds a bucket session and a row
 * that can never turn `ready`. A self-rescheduling timeout chain, so a slow pass
 * cannot overlap the next, and dormant without storage configured.
 * TODO(#124): move to the worker deployable; where `min_instances` is 0 the
 * tick only fires under load.
 */
@Injectable()
export class FileUploadSweeper
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(FileUploadSweeper.name);
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<unknown> | undefined;
  private stopped = false;

  constructor(
    @Inject(FileService) private readonly files: FileService,
    @Inject(FileStorageToken) private readonly storage: FileStorage,
    @Inject(ConfigToken) private readonly config: Config
  ) {}

  onApplicationBootstrap(): void {
    if (this.storage.available) {
      this.logger.log(
        `upload sweeper starting (tick ${TICK_MS}ms, session ttl ${
          this.config.fileStorage?.sessionTtlSeconds ?? 0
        }s)`
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

  /** One sweep pass. Public so tests can drive it directly. */
  async tick(): Promise<number> {
    const swept = await this.files.sweepExpiredUploads();
    if (swept > 0) {
      this.logger.log(`upload sweep: expired=${swept}`);
    }
    return swept;
  }

  private schedule(): void {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => {
      this.inFlight = this.tick()
        .catch((error: unknown) => {
          this.logger.error(`upload sweep failed: ${String(error)}`);
        })
        .finally(() => {
          this.schedule();
        });
    }, TICK_MS);
  }
}

import type { ThreadRunResponse } from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import {
  deleteAtPath,
  type MetadataBag,
  MetadataStore,
  parseMetadataKeyPath,
  setAtPath,
} from "@aec-craft/platform-metadata";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import {
  type Database,
  DatabaseToken,
} from "../../../database/database.module";
import { threadRun } from "../../../database/schema";
import { ThreadErrors } from "../../thread.errors";
import { toThreadRunResponse } from "../thread.run.service";

/**
 * A terminal run still accepts these: the bag is app data rather than lifecycle,
 * and its first consumer records provenance for a run that has finished.
 */
@Injectable()
export class ThreadRunMetadataService {
  private readonly store: MetadataStore<typeof threadRun>;

  constructor(@Inject(DatabaseToken) private readonly db: Database) {
    this.store = new MetadataStore(db, {
      table: threadRun,
      notFound: new PlatformError(ThreadErrors.RUN_NOT_FOUND),
    });
  }

  async set(
    threadId: string,
    runId: string,
    keyPath: string,
    value: unknown
  ): Promise<ThreadRunResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(threadId, runId, (bag) => setAtPath(bag, path, value));
  }

  async delete(
    threadId: string,
    runId: string,
    keyPath: string
  ): Promise<ThreadRunResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(threadId, runId, (bag) => deleteAtPath(bag, path));
  }

  private async write(
    threadId: string,
    runId: string,
    mutate: (bag: MetadataBag) => MetadataBag
  ): Promise<ThreadRunResponse> {
    await this.assertRunInThread(threadId, runId);
    return toThreadRunResponse(await this.store.write(runId, mutate));
  }

  /**
   * The guard authorized the thread, not the run: without this a caller could
   * address any run id from a thread they do own.
   */
  private async assertRunInThread(
    threadId: string,
    runId: string
  ): Promise<void> {
    const rows = await this.db
      .select({ id: threadRun.id })
      .from(threadRun)
      .where(and(eq(threadRun.id, runId), eq(threadRun.threadId, threadId)))
      .limit(1);
    if (!rows[0]) {
      throw new PlatformError(ThreadErrors.RUN_NOT_FOUND);
    }
  }
}

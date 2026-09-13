import { scopeWhereStrict } from "@aec-craft/platform-common/drizzle";
import type {
  ResolvedScope,
  ThreadResponse,
} from "@aec-craft/platform-contracts";
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
import { type Database, DatabaseToken } from "../../database/database.module";
import { thread } from "../../database/schema";
import { ThreadErrors } from "../thread.errors";
import { toThreadResponse } from "../thread.service";

/**
 * The write bumps `updatedAt`, so setting a key moves the thread to the head of
 * the list the way a rename does.
 */
@Injectable()
export class ThreadMetadataService {
  private readonly store: MetadataStore<typeof thread>;

  constructor(@Inject(DatabaseToken) private readonly db: Database) {
    this.store = new MetadataStore(db, {
      table: thread,
      notFound: new PlatformError(ThreadErrors.NOT_FOUND),
    });
  }

  async set(
    scope: ResolvedScope,
    ownerId: string,
    threadId: string,
    keyPath: string,
    value: unknown
  ): Promise<ThreadResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(scope, ownerId, threadId, (bag) =>
      setAtPath(bag, path, value)
    );
  }

  async delete(
    scope: ResolvedScope,
    ownerId: string,
    threadId: string,
    keyPath: string
  ): Promise<ThreadResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(scope, ownerId, threadId, (bag) =>
      deleteAtPath(bag, path)
    );
  }

  private async write(
    scope: ResolvedScope,
    ownerId: string,
    threadId: string,
    mutate: (bag: MetadataBag) => MetadataBag
  ): Promise<ThreadResponse> {
    await this.assertOwned(scope, ownerId, threadId);
    return toThreadResponse(await this.store.write(threadId, mutate));
  }

  /** Defence in depth: the guard has already run this. */
  private async assertOwned(
    scope: ResolvedScope,
    ownerId: string,
    threadId: string
  ): Promise<void> {
    const rows = await this.db
      .select({ id: thread.id })
      .from(thread)
      .where(
        and(
          eq(thread.id, threadId),
          eq(thread.subject, ownerId),
          scopeWhereStrict(thread, scope)
        )
      )
      .limit(1);
    if (!rows[0]) {
      throw new PlatformError(ThreadErrors.NOT_FOUND);
    }
  }
}

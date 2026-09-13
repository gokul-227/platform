import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import {
  type Database,
  DatabaseToken,
  type GraphTransaction,
} from "../../database/database.module";
import { type GraphVersionRow, graphVersion } from "../../database/schema";

export type { GraphVersionRow } from "../../database/schema";

export interface GraphVersionEvent {
  /** The acting person's `user.id`, resolved once per changeset. Null for a
   * machine, a worker, or a caller with no profile. */
  actorId: string | null;
  /** NULL for delete tombstones. */
  contentHash: string | null;
  entityId: string;
  entityType: "node" | "edge";
  /** The group that owns the row, carried onto the feed so a consumer can filter. */
  groupId: string;
  op: "created" | "updated" | "deleted";
  orgId: string;
  projectId: string | null;
  /** Full entity image in API-response shape; NULL for delete tombstones. */
  snapshot: Record<string, unknown> | null;
  /** Entity version counter AFTER the op. For deletes: the last version. */
  version: string;
}

/**
 * `record` is composed into the caller's own transaction, so a version row
 * commits or rolls back with the write it describes, and never reaches the wire.
 *
 * The feed claims with `FOR UPDATE SKIP LOCKED`, so instances cooperate and a
 * crashed claimant's rows unlock on rollback: at-least-once, idempotent on the
 * consumer. A seq-watermark cursor would be wrong, because bigserial values can
 * become visible out of commit order.
 */
@Injectable()
export class GraphVersionService {
  constructor(@Inject(DatabaseToken) private readonly db: Database) {}

  async record(trx: GraphTransaction, event: GraphVersionEvent): Promise<void> {
    await trx.insert(graphVersion).values({
      entityType: event.entityType,
      entityId: event.entityId,
      op: event.op,
      version: event.version,
      orgId: event.orgId,
      projectId: event.projectId,
      groupId: event.groupId,
      actorId: event.actorId,
      contentHash: event.contentHash,
      snapshot: event.snapshot,
    });
  }

  /** Oldest-first batch of rows not yet projected into the graph DB. */
  async claimUnsynced(
    trx: GraphTransaction,
    limit: number
  ): Promise<GraphVersionRow[]> {
    return await trx
      .select()
      .from(graphVersion)
      .where(isNull(graphVersion.syncedAt))
      .orderBy(asc(graphVersion.seq))
      .limit(limit)
      .for("update", { skipLocked: true });
  }

  async markSynced(trx: GraphTransaction, seqs: number[]): Promise<void> {
    if (seqs.length === 0) {
      return;
    }
    await trx
      .update(graphVersion)
      .set({ syncedAt: new Date() })
      .where(inArray(graphVersion.seq, seqs));
  }

  /** History of one entity, oldest first. Read path for future as-of reads. */
  async history(
    entityType: "node" | "edge",
    entityId: string
  ): Promise<GraphVersionRow[]> {
    return await this.db
      .select()
      .from(graphVersion)
      .where(
        and(
          eq(graphVersion.entityType, entityType),
          eq(graphVersion.entityId, entityId)
        )
      )
      .orderBy(asc(graphVersion.seq));
  }
}

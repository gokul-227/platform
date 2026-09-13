import type { PlatformError } from "@aec-craft/platform-contracts";
import { eq } from "drizzle-orm";
import type {
  PgColumn,
  PgDatabase,
  PgQueryResultHKT,
  PgTable,
} from "drizzle-orm/pg-core";
import type { MetadataBag } from "./metadata.paths";

/**
 * The column shape a table must carry to host a metadata bag: a `uuid` id, a
 * `jsonb` metadata bag, and an `updatedAt` timestamp.
 */
export type MetadataCarrierTable = PgTable & {
  id: PgColumn;
  metadata: PgColumn;
  updatedAt: PgColumn;
};

/** The transaction handed to write hooks — a drizzle transaction, schema-erased. */
export type MetadataTransaction = PgDatabase<
  PgQueryResultHKT,
  Record<string, unknown>
>;

export interface MetadataStoreOptions<TTable extends MetadataCarrierTable> {
  /** Thrown when no row matches the id. */
  notFound: PlatformError;
  /** The bound table; the constraint proves it carries `(id, metadata, updatedAt)`. */
  table: TTable;
}

export interface MetadataWriteOptions<Row> {
  /** Optional same-transaction hook (e.g. an audit write; self-writes go unaudited). */
  hook?: (tx: MetadataTransaction, row: Row) => Promise<void>;
}

/**
 * Locked read-modify-write over one table's metadata bags, bound to the table
 * at construction — the binding is the only place a domain name appears.
 * Runs under `SELECT … FOR UPDATE` so concurrent writers can't clobber each
 * other (distinct paths never conflict, same-path is last-write-wins), and
 * runs the hook in the same transaction so its row commits or rolls back with
 * the write. The constraint on `table` proves the shape; the internal casts
 * only erase the caller's schema generic, which the queries never touch.
 */
export class MetadataStore<TTable extends MetadataCarrierTable> {
  private readonly db: MetadataTransaction;

  constructor(
    db: PgDatabase<PgQueryResultHKT, Record<string, unknown>>,
    private readonly options: MetadataStoreOptions<TTable>
  ) {
    this.db = db;
  }

  write(
    id: string,
    mutate: (bag: MetadataBag) => MetadataBag,
    options: MetadataWriteOptions<TTable["$inferSelect"]> = {}
  ): Promise<TTable["$inferSelect"]> {
    const table = this.options.table;
    return this.db.transaction(async (tx) => {
      const current = await tx
        .select({ metadata: table.metadata })
        .from(table as PgTable)
        .where(eq(table.id, id))
        .for("update");
      const bag = current[0];
      if (!bag) {
        throw this.options.notFound;
      }
      const updated = await tx
        .update(table as PgTable)
        .set({
          metadata: mutate(bag.metadata as MetadataBag),
          updatedAt: new Date(),
        } as Record<string, unknown>)
        .where(eq(table.id, id))
        .returning();
      const row = updated[0] as TTable["$inferSelect"];
      if (!row) {
        throw this.options.notFound;
      }
      if (options.hook) {
        await options.hook(tx as MetadataTransaction, row);
      }
      return row;
    });
  }
}

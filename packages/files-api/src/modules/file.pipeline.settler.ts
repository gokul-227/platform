import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { type Database, DatabaseToken } from "../database/database.module";

/**
 * Turns a `processing` file `ready` once no step owes it anything. Apart from
 * both `FileService` and the steps because it is the one thing that knows about
 * all of them, and neither dependency direction allows that.
 *
 * A step reaching `failed` owes nothing: the bytes were verified long before,
 * and the failure is on the step's own row. One statement guarded on
 * `processing`, so every terminal path may call it. A new step adds a clause.
 */
@Injectable()
export class FilePipelineSettler {
  constructor(@Inject(DatabaseToken) private readonly db: Database) {}

  async settle(fileId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE "file" SET "status" = 'ready', "updated_at" = now()
      WHERE "id" = ${fileId}
        AND "status" = 'processing'
        AND NOT EXISTS (
          SELECT 1 FROM "file_index" fi
          WHERE fi."file_id" = "file"."id"
            AND fi."status" IN ('pending', 'processing')
        )
    `);
  }

  /** Claim the file for a pipeline. Idempotent, and never moves a pending row. */
  async hold(fileId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE "file" SET "status" = 'processing', "updated_at" = now()
      WHERE "id" = ${fileId} AND "status" = 'ready'
    `);
  }
}

import { AuditWriter } from "@aec-craft/platform-audit-api";
import { scopeWhereStrict } from "@aec-craft/platform-common/drizzle";
import type {
  FileResponse,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import {
  deleteAtPath,
  type MetadataBag,
  MetadataStore,
  parseMetadataKeyPath,
  setAtPath,
} from "@aec-craft/platform-metadata";
import {
  type ActorPrincipal,
  recordedActorId,
} from "@aec-craft/platform-users-api";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { type Database, DatabaseToken } from "../../database/database.module";
import { file } from "../../database/schema";
import { FileErrors } from "../file.errors";
import { hasChildrenOf, toFileResponse } from "../file.service";

/**
 * File and folder metadata KV writes (path math + locked write:
 * `@aec-craft/platform-metadata`), audited per key rather than per bag.
 */
@Injectable()
export class FileMetadataService {
  private readonly store: MetadataStore<typeof file>;

  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(AuditWriter) private readonly audit: AuditWriter
  ) {
    this.store = new MetadataStore(db, {
      table: file,
      notFound: new PlatformError(FileErrors.NOT_FOUND),
    });
  }

  async set(
    scope: ResolvedScope,
    fileId: string,
    keyPath: string,
    value: unknown,
    principal: ActorPrincipal | null = null
  ): Promise<FileResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(
      scope,
      fileId,
      keyPath,
      principal,
      (bag) => setAtPath(bag, path, value),
      { after: { value } }
    );
  }

  async delete(
    scope: ResolvedScope,
    fileId: string,
    keyPath: string,
    principal: ActorPrincipal | null = null
  ): Promise<FileResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(
      scope,
      fileId,
      keyPath,
      principal,
      (bag) => deleteAtPath(bag, path),
      {}
    );
  }

  private async write(
    scope: ResolvedScope,
    fileId: string,
    keyPath: string,
    principal: ActorPrincipal | null,
    mutate: (bag: MetadataBag) => MetadataBag,
    auditExtra: Record<string, unknown>
  ): Promise<FileResponse> {
    await this.assertInScope(scope, fileId);
    const actor = principal
      ? {
          id: await recordedActorId(this.db, principal),
          type: principal.type as string,
        }
      : { id: null, type: "system" };

    const row = await this.store.write(fileId, mutate, {
      hook: (tx, written) =>
        this.audit.record(tx, {
          resource: written.type === "folder" ? "folder" : "file",
          verb: "updated",
          resourceId: written.id,
          label: written.name,
          orgId: written.orgId,
          projectId: written.projectId,
          groupId: written.groupId,
          actorId: actor.id,
          actorType: actor.type,
          payload: { metadataKey: keyPath, ...auditExtra },
        }),
    });
    return toFileResponse(row, await hasChildrenOf(this.db, row));
  }

  private async assertInScope(
    scope: ResolvedScope,
    fileId: string
  ): Promise<void> {
    const rows = await this.db
      .select({ id: file.id })
      .from(file)
      .where(and(eq(file.id, fileId), scopeWhereStrict(file, scope)))
      .limit(1);
    if (!rows[0]) {
      throw new PlatformError(FileErrors.NOT_FOUND);
    }
  }
}

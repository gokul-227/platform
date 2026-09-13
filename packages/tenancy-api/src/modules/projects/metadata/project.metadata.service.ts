import { AuditWriter } from "@aec-craft/platform-audit-api";
import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
import type { ProjectResponse } from "@aec-craft/platform-contracts";
import { PlatformError } from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import {
  deleteAtPath,
  type MetadataBag,
  MetadataStore,
  parseMetadataKeyPath,
  setAtPath,
} from "@aec-craft/platform-metadata";
import { recordedActorId } from "@aec-craft/platform-users-api";
import { Inject, Injectable } from "@nestjs/common";
import {
  type Database,
  DatabaseToken,
} from "../../../database/database.module";
import { project } from "../../../database/schema";
import { ProjectErrors } from "../project.errors";
import { toProjectResponse } from "../project.service";

@Injectable()
export class ProjectMetadataService {
  private readonly store: MetadataStore<typeof project>;

  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {
    this.store = new MetadataStore(db, {
      table: project,
      notFound: new PlatformError(ProjectErrors.NOT_FOUND),
    });
  }

  async set(
    projectId: string,
    keyPath: string,
    value: unknown,
    principal: Principal
  ): Promise<ProjectResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(
      projectId,
      keyPath,
      principal,
      (bag) => setAtPath(bag, path, value),
      { after: { value } }
    );
  }

  async delete(
    projectId: string,
    keyPath: string,
    principal: Principal
  ): Promise<ProjectResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(
      projectId,
      keyPath,
      principal,
      (bag) => deleteAtPath(bag, path),
      {}
    );
  }

  private async write(
    projectId: string,
    keyPath: string,
    principal: Principal,
    mutate: (bag: MetadataBag) => MetadataBag,
    auditExtra: Record<string, unknown>
  ): Promise<ProjectResponse> {
    const groupId = await this.checks.resolveGroup({
      type: "project",
      projectId,
    });
    const actorId = await recordedActorId(this.db, principal);
    const row = await this.store.write(projectId, mutate, {
      hook: (tx, row) =>
        this.audit.record(tx, {
          resource: "project",
          verb: "updated",
          label: row.name,
          resourceId: row.id,
          orgId: row.orgId,
          projectId: row.id,
          groupId,
          actorId,
          actorType: principal.type,
          payload: { metadataKey: keyPath, ...auditExtra },
        }),
    });
    return toProjectResponse(row);
  }
}

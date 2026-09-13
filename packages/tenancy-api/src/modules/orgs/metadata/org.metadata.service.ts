import { AuditWriter } from "@aec-craft/platform-audit-api";
import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
import type { OrgResponse } from "@aec-craft/platform-contracts";
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
import { org } from "../../../database/schema";
import { OrgErrors } from "../org.errors";
import { toOrgResponse } from "../org.service";

@Injectable()
export class OrgMetadataService {
  private readonly store: MetadataStore<typeof org>;

  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService
  ) {
    this.store = new MetadataStore(db, {
      table: org,
      notFound: new PlatformError(OrgErrors.NOT_FOUND),
    });
  }

  async set(
    orgId: string,
    keyPath: string,
    value: unknown,
    principal: Principal
  ): Promise<OrgResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(
      orgId,
      keyPath,
      principal,
      (bag) => setAtPath(bag, path, value),
      { after: { value } }
    );
  }

  async delete(
    orgId: string,
    keyPath: string,
    principal: Principal
  ): Promise<OrgResponse> {
    const path = parseMetadataKeyPath(keyPath);
    return this.write(
      orgId,
      keyPath,
      principal,
      (bag) => deleteAtPath(bag, path),
      {}
    );
  }

  private async write(
    orgId: string,
    keyPath: string,
    principal: Principal,
    mutate: (bag: MetadataBag) => MetadataBag,
    auditExtra: Record<string, unknown>
  ): Promise<OrgResponse> {
    const groupId = await this.checks.resolveGroup({ type: "org", orgId });
    const actorId = await recordedActorId(this.db, principal);
    const row = await this.store.write(orgId, mutate, {
      hook: (tx, row) =>
        this.audit.record(tx, {
          resource: "org",
          verb: "updated",
          resourceId: row.id,
          label: row.name,
          orgId: row.id,
          groupId,
          actorId,
          actorType: principal.type,
          payload: { metadataKey: keyPath, ...auditExtra },
        }),
    });
    return toOrgResponse(row);
  }
}

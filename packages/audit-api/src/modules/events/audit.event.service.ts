import {
  filterConditions,
  groupWhereReadable,
  keysetOrder,
  keysetWhere,
  sortExpressions,
  totalOver,
} from "@aec-craft/platform-common/drizzle";
import type {
  AuditEventListInput,
  AuditEventListResponse,
  AuditEventResponse,
} from "@aec-craft/platform-contracts";
import {
  auditEventList,
  fetchCursorPage,
  fetchOffsetPage,
  PlatformError,
  resolvePageQuery,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, or, type SQL } from "drizzle-orm";
import { type Database, DatabaseToken } from "../../database/database.module";
import { type AuditEventRow, auditEvent } from "../../database/schema";
import { AuditEventErrors } from "./audit.event.errors";

/**
 * Reads only. Rows are written by each domain inside its own canonical
 * transaction, never through this package, so the log cannot drift from reality.
 */
@Injectable()
export class AuditEventService {
  constructor(@Inject(DatabaseToken) private readonly db: Database) {}

  async list(
    input: AuditEventListInput,
    scope: { orgId?: string; projectId?: string },
    readable: readonly string[]
  ): Promise<AuditEventListResponse> {
    const page = resolvePageQuery(auditEventList.pagination, input);
    const conditions: SQL[] = [
      // Reading a partition's log is not reading every group inside it: a row
      // names a resource id, so it discloses one the caller may not see.
      groupWhereReadable(auditEvent.groupId, readable),
      ...filterConditions(
        auditEventList.filters,
        input as Record<string, unknown>
      ),
    ];
    if (scope.orgId !== undefined) {
      conditions.push(eq(auditEvent.orgId, scope.orgId));
    }
    if (scope.projectId === undefined) {
      conditions.push(orgLevelOnly());
    } else {
      conditions.push(eq(auditEvent.projectId, scope.projectId));
    }

    if (page.mode === "offset") {
      const sort = sortExpressions(
        auditEventList.filters,
        input as Record<string, unknown>
      );
      const orderBy = sort.length > 0 ? sort : [desc(auditEvent.createdAt)];
      return await fetchOffsetPage(
        page,
        (limit, offset) =>
          this.db
            .select({ row: auditEvent, total: totalOver() })
            .from(auditEvent)
            .where(and(...conditions))
            .orderBy(...orderBy, desc(auditEvent.id))
            .limit(limit)
            .offset(offset),
        (r) => toAuditEventResponse(r.row),
        (r) => r.total
      );
    }

    const keyset = {
      timestamp: auditEvent.createdAt,
      id: auditEvent.id,
      direction: "desc" as const,
    };
    return await fetchCursorPage(
      page,
      (limit) =>
        this.db
          .select()
          .from(auditEvent)
          .where(and(...conditions, keysetWhere(keyset, page.cursor)))
          .orderBy(...keysetOrder(keyset))
          .limit(limit),
      toAuditEventResponse,
      (row) => [row.createdAt, row.id]
    );
  }

  async findById(
    eventId: string,
    scope: { orgId?: string; projectId?: string }
  ): Promise<AuditEventResponse> {
    const conditions: SQL[] = [eq(auditEvent.id, eventId)];
    if (scope.orgId !== undefined) {
      conditions.push(eq(auditEvent.orgId, scope.orgId));
    }
    if (scope.projectId !== undefined) {
      conditions.push(eq(auditEvent.projectId, scope.projectId));
    }
    const rows = await this.db
      .select()
      .from(auditEvent)
      .where(and(...conditions))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(AuditEventErrors.NOT_FOUND);
    }
    return toAuditEventResponse(row);
  }
}

/**
 * A project row carries its org too, so an unfiltered org feed would be every
 * file upload in every project. A row whose `resourceId` is the project itself
 * is about the project, so it stays.
 */
function orgLevelOnly(): SQL {
  return or(
    isNull(auditEvent.projectId),
    eq(auditEvent.resourceId, auditEvent.projectId)
  ) as SQL;
}

function toAuditEventResponse(row: AuditEventRow): AuditEventResponse {
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    groupId: row.groupId,
    actorId: row.actorId,
    actorType: row.actorType,
    actorIsStaff: row.actorIsStaff,
    resource: row.resource,
    resourceId: row.resourceId,
    resourceLabel: row.resourceLabel,
    verb: row.verb,
    context: row.context,
    payload: row.payload ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

import { AuditWriter } from "@aec-craft/platform-audit-api";
import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
import {
  isUniqueViolation,
  makeSlug,
  uniqueSlug,
} from "@aec-craft/platform-common";
import {
  filterConditions,
  firstRowOrThrow,
  keysetOrder,
  keysetWhere,
  sortExpressions,
  totalOver,
} from "@aec-craft/platform-common/drizzle";
import type {
  ProjectListInput,
  ProjectListResponse,
  ProjectResponse,
} from "@aec-craft/platform-contracts";
import {
  fetchCursorPage,
  fetchOffsetPage,
  PlatformError,
  projectList,
  resolvePageQuery,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { recordedActorId } from "@aec-craft/platform-users-api";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type Database, DatabaseToken } from "../../database/database.module";
import { org, project } from "../../database/schema";
import { OrgErrors } from "../orgs/org.errors";
import type { CreateProjectDto, UpdateProjectDto } from "./project.dtos";
import { ProjectErrors } from "./project.errors";

/** No default and no nullable principal: an omission would read as `estate`. */
export type ProjectListScope =
  | { type: "readableBy"; principal: Principal }
  | { type: "estate" };

/**
 * The delivery boundary. Creation is one transaction: the row, its group under
 * the org's root, and the roster joins that let org staff reach it by default.
 * Withholding those joins is how a restricted project is made, and it is a
 * switch on the group rather than a flag here.
 *
 * Slug uniqueness is the composite `(org_id, slug)`, not global.
 */
@Injectable()
export class ProjectService {
  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService,
    @Inject(AuditWriter) private readonly audit: AuditWriter
  ) {}

  /**
   * `orgId` in the filter narrows the candidate set before any check runs, which
   * is what makes the nested route cheaper. `estate` drops the visibility
   * predicate and still honours `orgId`.
   */
  async list(
    input: ProjectListInput,
    scope: ProjectListScope
  ): Promise<ProjectListResponse> {
    if (scope.type === "estate") {
      return await this.paginate(input, () => []);
    }
    const page = resolvePageQuery(projectList.pagination, input);
    const visible = await this.checks.readableProjects(scope.principal, {
      orgId: orgIdFilter(input),
    });
    if (visible.length === 0) {
      // Empty page, not an error, and the envelope still has to match the
      // mode the caller asked for.
      return (
        page.mode === "offset"
          ? {
              items: [],
              page: page.page,
              pageSize: page.pageSize,
              total: 0,
              totalPages: 0,
            }
          : { items: [], nextCursor: null }
      ) as ProjectListResponse;
    }
    return await this.paginate(input, (p) => [inArray(p.id, visible)]);
  }

  private async paginate(
    input: ProjectListInput,
    scoped: (p: ReturnType<typeof alias<typeof project, "p">>) => SQL[]
  ): Promise<ProjectListResponse> {
    // The filter spec addresses columns through the `p` alias.
    const p = alias(project, "p");
    const page = resolvePageQuery(projectList.pagination, input);
    const conditions: SQL[] = [
      ...scoped(p),
      ...filterConditions(
        projectList.filters,
        input as Record<string, unknown>
      ),
    ];

    if (page.mode === "offset") {
      const sort = sortExpressions(
        projectList.filters,
        input as Record<string, unknown>
      );
      const orderBy = sort.length > 0 ? sort : [asc(p.name)];
      return await fetchOffsetPage(
        page,
        (limit, offset) =>
          this.db
            .select({ row: p, total: totalOver() })
            .from(p)
            .where(and(...conditions))
            .orderBy(...orderBy, desc(p.id))
            .limit(limit)
            .offset(offset),
        (r) => toProjectResponse(r.row),
        (r) => r.total
      );
    }

    const keyset = {
      timestamp: p.createdAt,
      id: p.id,
      direction: "desc" as const,
    };
    return await fetchCursorPage(
      page,
      (limit) =>
        this.db
          .select({ row: p })
          .from(p)
          .where(and(...conditions, keysetWhere(keyset, page.cursor)))
          .orderBy(...keysetOrder(keyset))
          .limit(limit),
      (r) => toProjectResponse(r.row),
      (r) => [r.row.createdAt, r.row.id]
    );
  }

  async findById(projectId: string): Promise<ProjectResponse> {
    const rows = await this.db
      .select()
      .from(project)
      .where(eq(project.id, projectId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(ProjectErrors.NOT_FOUND);
    }
    return toProjectResponse(row);
  }

  /** The project, its group and the roster joins are one transaction. */
  async create(
    orgId: string,
    principal: Principal,
    dto: CreateProjectDto
  ): Promise<ProjectResponse> {
    const orgHits = await this.db
      .select({ id: org.id })
      .from(org)
      .where(eq(org.id, orgId))
      .limit(1);
    if (orgHits.length === 0) {
      throw new PlatformError(OrgErrors.NOT_FOUND);
    }

    const baseSlug = dto.slug ?? makeSlug(dto.name);
    if (!baseSlug) {
      throw new PlatformError(
        ValidationErrors.FAILED,
        "Cannot derive a slug from the supplied name; pass `slug` explicitly"
      );
    }
    const slug = await uniqueSlug(baseSlug, async (candidate) => {
      const hits = await this.db
        .select({ id: project.id })
        .from(project)
        .where(and(eq(project.orgId, orgId), eq(project.slug, candidate)))
        .limit(1);
      return hits.length === 0;
    });

    const actorId = await recordedActorId(this.db, principal);
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(project)
        .values({ orgId, slug, name: dto.name, metadata: dto.metadata ?? {} })
        .returning();
      const row = firstRowOrThrow(
        rows,
        () => new PlatformError(ProjectErrors.NOT_FOUND)
      );
      const rootGroupId = await this.checks.resolveGroup({
        type: "org",
        orgId,
      });
      const projectGroup = await this.checks.createGroup(tx, {
        orgId,
        projectId: row.id,
        parentGroupId: rootGroupId,
        type: "project",
        name: row.name,
        slug: `project-${row.slug}`,
      });
      await this.audit.record(tx, {
        resource: "project",
        verb: "created",
        label: row.name,
        resourceId: row.id,
        orgId: row.orgId,
        projectId: row.id,
        groupId: projectGroup.id,
        actorId,
        actorType: principal.type,
        payload: { after: { slug: row.slug, name: row.name } },
      });
      return toProjectResponse(row);
    });
  }

  async update(
    projectId: string,
    dto: UpdateProjectDto,
    principal: Principal
  ): Promise<ProjectResponse> {
    const groupId = await this.checks.resolveGroup({
      type: "project",
      projectId,
    });
    const actorId = await recordedActorId(this.db, principal);
    try {
      return await this.db.transaction(async (tx) => {
        // The before-state both detects a no-op submit, which skips the write
        // and its audit row, and gives the audit diff its left side.
        const beforeRows = await tx
          .select()
          .from(project)
          .where(eq(project.id, projectId))
          .limit(1);
        const before = beforeRows[0];
        if (!before) {
          throw new PlatformError(ProjectErrors.NOT_FOUND);
        }
        const patch: Partial<typeof project.$inferInsert> = {};
        if (dto.name !== undefined && dto.name !== before.name) {
          patch.name = dto.name;
        }
        if (dto.slug !== undefined && dto.slug !== before.slug) {
          patch.slug = dto.slug;
        }
        if (Object.keys(patch).length === 0) {
          return toProjectResponse(before);
        }
        patch.updatedAt = new Date();
        const rows = await tx
          .update(project)
          .set(patch)
          .where(eq(project.id, projectId))
          .returning();
        const row = firstRowOrThrow(
          rows,
          () => new PlatformError(ProjectErrors.NOT_FOUND)
        );
        await this.audit.record(tx, {
          resource: "project",
          verb: "updated",
          label: row.name,
          groupId,
          resourceId: row.id,
          orgId: row.orgId,
          projectId: row.id,
          actorId,
          actorType: principal.type,
          payload: {
            before: { name: before.name, slug: before.slug },
            after: { name: row.name, slug: row.slug },
          },
        });
        return toProjectResponse(row);
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new PlatformError(ProjectErrors.SLUG_TAKEN);
      }
      throw err;
    }
  }

  /**
   * Every group beneath it goes too, tuples included, so Keto stops answering
   * for objects that no longer exist.
   */
  async delete(projectId: string, principal: Principal): Promise<void> {
    // Before the transaction, as with an org: the subtree goes first and the
    // audit row after it.
    const groupId = await this.checks.resolveGroup({
      type: "project",
      projectId,
    });
    const actorId = await recordedActorId(this.db, principal);
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: project.id,
          orgId: project.orgId,
          name: project.name,
          slug: project.slug,
        })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1);
      const existing = rows[0];
      if (!existing) {
        throw new PlatformError(ProjectErrors.NOT_FOUND);
      }
      await this.checks.deleteProjectTree(tx, projectId);
      await tx.delete(project).where(eq(project.id, projectId));
      await this.audit.record(tx, {
        resource: "project",
        verb: "deleted",
        label: existing.name,
        groupId,
        resourceId: projectId,
        orgId: existing.orgId,
        projectId,
        actorId,
        actorType: principal.type,
        payload: { before: { name: existing.name, slug: existing.slug } },
      });
    });
  }
}

/** Narrows the candidate set before any check runs. Spelled `eq.<uuid>`. */
function orgIdFilter(input: ProjectListInput): string | undefined {
  const raw = (input as Record<string, unknown>).orgId;
  if (typeof raw !== "string") {
    return;
  }
  const [op, value] = raw.split(".");
  return op === "eq" && value ? value : undefined;
}

export function toProjectResponse(row: {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}): ProjectResponse {
  return {
    id: row.id,
    orgId: row.orgId,
    slug: row.slug,
    name: row.name,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

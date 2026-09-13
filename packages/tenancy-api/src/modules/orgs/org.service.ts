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
  OrgListInput,
  OrgListResponse,
  OrgResponse,
} from "@aec-craft/platform-contracts";
import {
  fetchCursorPage,
  fetchOffsetPage,
  orgList,
  PlatformError,
  resolvePageQuery,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import {
  recordedActorId,
  subjectForEmail,
} from "@aec-craft/platform-users-api";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { type Database, DatabaseToken } from "../../database/database.module";
import { org } from "../../database/schema";
import { MemberErrors } from "../members/member.errors";
import type { CreateOrgDto, UpdateOrgDto } from "./org.dtos";
import { OrgErrors } from "./org.errors";

/** No default and no nullable principal: an omission would read as `estate`. */
export type OrgListScope =
  | { type: "readableBy"; principal: Principal }
  | { type: "estate" };

/**
 * The tenant row. Membership is not here: it is a standing, administered
 * through `/orgs/:orgId/members`.
 */
/**
 * Who is bringing a tenant into being, and who owns it afterwards.
 *
 * `self` is `POST /orgs`: the caller becomes the first owner, which is the only
 * thing that makes an open create safe. `staff` is the admin surface, which
 * names the owner instead and joins nothing — a staff admin setting a customer up
 * has no business appearing on their roster.
 */
export type OrgCreator =
  | { type: "self" }
  | { type: "staff"; ownerEmail: string };

/**
 * Who is changing or removing one. No owner to name in either case; this only
 * decides whether the audit row says the change came from the vendor.
 */
export type OrgActor = { type: "self" } | { type: "staff" };

const AS_SELF = { type: "self" } as const;

@Injectable()
export class OrgService {
  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService,
    @Inject(AuditWriter) private readonly audit: AuditWriter
  ) {}

  /**
   * `readableBy` bounds the page to what the caller reaches, so an org they hold
   * nothing on is absent rather than forbidden. `estate` drops that predicate
   * and is the staff surface.
   */
  async list(
    input: OrgListInput,
    scope: OrgListScope
  ): Promise<OrgListResponse> {
    if (scope.type === "estate") {
      return await this.paginate(input, []);
    }
    const page = resolvePageQuery(orgList.pagination, input);
    const visible = await this.checks.readableOrgs(scope.principal);
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
      ) as OrgListResponse;
    }
    return await this.paginate(input, [inArray(org.id, visible)]);
  }

  private async paginate(
    input: OrgListInput,
    scoped: SQL[]
  ): Promise<OrgListResponse> {
    const page = resolvePageQuery(orgList.pagination, input);
    const conditions: SQL[] = [
      ...scoped,
      ...filterConditions(orgList.filters, input as Record<string, unknown>),
    ];
    if (page.mode === "offset") {
      const sort = sortExpressions(
        orgList.filters,
        input as Record<string, unknown>
      );
      const orderBy = sort.length > 0 ? sort : [asc(org.name)];
      return await fetchOffsetPage(
        page,
        (limit, offset) =>
          this.db
            .select({ row: org, total: totalOver() })
            .from(org)
            .where(and(...conditions))
            .orderBy(...orderBy, desc(org.id))
            .limit(limit)
            .offset(offset),
        (r) => toOrgResponse(r.row),
        (r) => r.total
      );
    }

    const keyset = {
      timestamp: org.createdAt,
      id: org.id,
      direction: "desc" as const,
    };
    return await fetchCursorPage(
      page,
      (limit) =>
        this.db
          .select({ row: org })
          .from(org)
          .where(and(...conditions, keysetWhere(keyset, page.cursor)))
          .orderBy(...keysetOrder(keyset))
          .limit(limit),
      (r) => toOrgResponse(r.row),
      (r) => [r.row.createdAt, r.row.id]
    );
  }

  async findById(orgId: string): Promise<OrgResponse> {
    const rows = await this.db
      .select()
      .from(org)
      .where(eq(org.id, orgId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(OrgErrors.NOT_FOUND);
    }
    return toOrgResponse(row);
  }

  /**
   * One transaction: an org whose group failed to appear is an org nobody can
   * be given access to.
   */
  async create(
    principal: Principal,
    dto: CreateOrgDto,
    creator: OrgCreator = AS_SELF
  ): Promise<OrgResponse> {
    const baseSlug = dto.slug ?? makeSlug(dto.name);
    if (!baseSlug) {
      throw new PlatformError(
        ValidationErrors.FAILED,
        "Cannot derive a slug from the supplied name; pass `slug` explicitly"
      );
    }
    const slug = await uniqueSlug(baseSlug, async (candidate) => {
      const hits = await this.db
        .select({ id: org.id })
        .from(org)
        .where(eq(org.slug, candidate))
        .limit(1);
      return hits.length === 0;
    });

    const owner = await this.ownerFor(principal, creator);
    const actorId = await recordedActorId(this.db, principal);
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(org)
        .values({ slug, name: dto.name, metadata: dto.metadata ?? {} })
        .returning();
      const row = firstRowOrThrow(
        rows,
        () => new PlatformError(OrgErrors.NOT_FOUND)
      );
      const rootGroup = await this.checks.createGroup(tx, {
        orgId: row.id,
        projectId: null,
        parentGroupId: null,
        type: "org",
        name: row.name,
        slug: row.slug,
        owner,
      });
      await this.audit.record(tx, {
        resource: "org",
        verb: "created",
        resourceId: row.id,
        label: row.name,
        orgId: row.id,
        groupId: rootGroup.id,
        actorId,
        actorType: principal.type,
        actorIsStaff: creator.type === "staff",
        payload: { after: { slug: row.slug, name: row.name } },
      });
      return toOrgResponse(row);
    });
  }

  /**
   * Who owns a new organization. The caller, unless staff named somebody —
   * which they must, because staff have no business on a customer's
   * roster and an organization with no owner can be administered by nobody.
   *
   * An address nobody has signed in with is refused rather than invited: it is
   * not an account yet, and a standing on a subject the identity provider has
   * never issued is one nothing can ever use.
   */
  private async ownerFor(
    principal: Principal,
    creator: OrgCreator
  ): Promise<string> {
    if (creator.type === "self") {
      return principal.subject;
    }
    const subject = await subjectForEmail(this.db, creator.ownerEmail);
    if (!subject) {
      throw new PlatformError(MemberErrors.EMAIL_UNKNOWN);
    }
    return subject;
  }

  async update(
    orgId: string,
    dto: UpdateOrgDto,
    principal: Principal,
    actor: OrgActor = AS_SELF
  ): Promise<OrgResponse> {
    const groupId = await this.checks.resolveGroup({ type: "org", orgId });
    const actorId = await recordedActorId(this.db, principal);
    try {
      return await this.db.transaction(async (tx) => {
        // The before-state both detects a no-op submit, which skips the write
        // and its audit row, and gives the audit diff its left side.
        const beforeRows = await tx
          .select()
          .from(org)
          .where(eq(org.id, orgId))
          .limit(1);
        const before = beforeRows[0];
        if (!before) {
          throw new PlatformError(OrgErrors.NOT_FOUND);
        }
        const patch: Partial<typeof org.$inferInsert> = {};
        if (dto.name !== undefined && dto.name !== before.name) {
          patch.name = dto.name;
        }
        if (dto.slug !== undefined && dto.slug !== before.slug) {
          patch.slug = dto.slug;
        }
        if (Object.keys(patch).length === 0) {
          return toOrgResponse(before);
        }
        patch.updatedAt = new Date();
        const rows = await tx
          .update(org)
          .set(patch)
          .where(eq(org.id, orgId))
          .returning();
        const row = firstRowOrThrow(
          rows,
          () => new PlatformError(OrgErrors.NOT_FOUND)
        );
        await this.audit.record(tx, {
          resource: "org",
          verb: "updated",
          resourceId: row.id,
          label: row.name,
          orgId: row.id,
          groupId,
          actorId,
          actorType: principal.type,
          actorIsStaff: actor.type === "staff",
          payload: {
            before: { name: before.name, slug: before.slug },
            after: { name: row.name, slug: row.slug },
          },
        });
        return toOrgResponse(row);
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new PlatformError(OrgErrors.SLUG_TAKEN);
      }
      throw err;
    }
  }

  /**
   * The group tree goes with the tenant: the rows cascade and their tuples are
   * removed in the same transaction, so Keto stops answering for them.
   */
  async delete(
    orgId: string,
    principal: Principal,
    actor: OrgActor = AS_SELF
  ): Promise<void> {
    // Before the transaction: `deleteOrgTree` removes the very row this
    // resolves, and the audit row is written after it.
    const groupId = await this.checks.resolveGroup({ type: "org", orgId });
    const actorId = await recordedActorId(this.db, principal);
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: org.id, name: org.name, slug: org.slug })
        .from(org)
        .where(eq(org.id, orgId))
        .limit(1);
      const existing = rows[0];
      if (!existing) {
        throw new PlatformError(OrgErrors.NOT_FOUND);
      }
      await this.checks.deleteOrgTree(tx, orgId);
      await tx.delete(org).where(eq(org.id, orgId));
      await this.audit.record(tx, {
        resource: "org",
        verb: "deleted",
        resourceId: orgId,
        label: existing.name,
        orgId,
        groupId,
        actorId,
        actorType: principal.type,
        actorIsStaff: actor.type === "staff",
        payload: { before: { name: existing.name, slug: existing.slug } },
      });
    });
  }
}

export function toOrgResponse(row: {
  id: string;
  slug: string;
  name: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}): OrgResponse {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
import {
  filterConditions,
  firstRowOrThrow,
  keysetOrder,
  keysetWhere,
  sortExpressions,
  totalOver,
} from "@aec-craft/platform-common/drizzle";
import type {
  UserListInput,
  UserListResponse,
  UserResponse,
} from "@aec-craft/platform-contracts";
import {
  fetchCursorPage,
  fetchOffsetPage,
  PlatformError,
  resolvePageQuery,
  userList,
} from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { type Database, DatabaseToken } from "../database/database.module";
import { user } from "../database/schema";
import { UserErrors } from "./user.errors";

/**
 * The shared user data layer. Nothing here creates a profile from a platform
 * request: the lifecycle belongs to the identity provider.
 */
@Injectable()
export class UserService {
  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService
  ) {}

  async findById(userId: string): Promise<UserResponse> {
    const rows = await this.db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(
        UserErrors.NOT_FOUND,
        `User '${userId}' not found`
      );
    }
    return toUserResponse(row);
  }

  /**
   * Unscoped by nature rather than by privilege: a person is not partitioned, so
   * there is no predicate to drop and no scoped counterpart.
   */
  async list(input: UserListInput): Promise<UserListResponse> {
    const page = resolvePageQuery(userList.pagination, input);
    const conditions: SQL[] = [
      ...filterConditions(userList.filters, input as Record<string, unknown>),
    ];

    if (page.mode === "offset") {
      const sort = sortExpressions(
        userList.filters,
        input as Record<string, unknown>
      );
      const orderBy = sort.length > 0 ? sort : [asc(user.createdAt)];
      return await fetchOffsetPage(
        page,
        (limit, offset) =>
          this.db
            .select({ row: user, total: totalOver() })
            .from(user)
            .where(and(...conditions))
            .orderBy(...orderBy, desc(user.id))
            .limit(limit)
            .offset(offset),
        (r) => toUserResponse(r.row),
        (r) => r.total
      );
    }

    const keyset = {
      timestamp: user.createdAt,
      id: user.id,
      direction: "desc" as const,
    };
    return await fetchCursorPage(
      page,
      (limit) =>
        this.db
          .select()
          .from(user)
          .where(and(...conditions, keysetWhere(keyset, page.cursor)))
          .orderBy(...keysetOrder(keyset))
          .limit(limit),
      toUserResponse,
      (row) => [row.createdAt, row.id]
    );
  }

  /**
   * Idempotent, because Kratos fires the same hook after a registration and
   * after a settings change.
   *
   * `picture` is in neither clause: the provider has no avatar trait, so naming
   * the column would null it on every fire. `PATCH /me` is its only writer.
   *
   * Three cases, because `external_id` and `email` are both unique and one
   * `ON CONFLICT` names a single target. Matching on email instead of identity
   * means the same person arrived under a new identity id, which is what a
   * provider swap looks like from here, so the row is rebound.
   */
  async upsertByExternalId(input: {
    externalId: string;
    email: string;
    name?: string | null;
  }): Promise<UserResponse> {
    const name = input.name ?? null;
    const row = await this.db.transaction(async (tx) => {
      const byIdentity = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.externalId, input.externalId))
        .limit(1);
      if (byIdentity[0]) {
        const updated = await tx
          .update(user)
          .set({ email: input.email, name, updatedAt: new Date() })
          .where(eq(user.id, byIdentity[0].id))
          .returning();
        return updated[0];
      }

      const byEmail = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, input.email))
        .limit(1);
      if (byEmail[0]) {
        const rebound = await tx
          .update(user)
          .set({ externalId: input.externalId, name, updatedAt: new Date() })
          .where(eq(user.id, byEmail[0].id))
          .returning();
        return rebound[0];
      }

      const inserted = await tx
        .insert(user)
        .values({ externalId: input.externalId, email: input.email, name })
        .returning();
      return inserted[0];
    });
    return toUserResponse(
      firstRowOrThrow(
        row ? [row] : [],
        () => new PlatformError(UserErrors.NOT_FOUND)
      )
    );
  }

  /** Idempotent: the console calls this after deleting the identity. */
  async deleteByExternalId(externalId: string): Promise<void> {
    const rows = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.externalId, externalId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return;
    }
    await this.delete(row.id);
  }

  /**
   * Refused while the person is the only owner of any group, because a group
   * with no owner cannot be administered; the blocking groups come back in
   * `details`. Their tuples go with the row, or the store would name somebody
   * who no longer exists.
   */
  async delete(userId: string): Promise<void> {
    const rows = await this.db
      .select({ externalId: user.externalId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const subject = rows[0]?.externalId;

    if (subject) {
      const blocking = await this.authorization.soleOwnerships(subject);
      if (blocking.length > 0) {
        throw new PlatformError(
          UserErrors.DELETE_BLOCKED_LAST_OWNER,
          undefined,
          { details: { groups: blocking } }
        );
      }
    }

    const deleted = await this.db
      .delete(user)
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (deleted.length === 0) {
      throw new PlatformError(
        UserErrors.NOT_FOUND,
        `User '${userId}' not found`
      );
    }
    if (subject) {
      await this.authorization.revokeAllFor(subject);
    }
  }
}

export function toUserResponse(row: {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}): UserResponse {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

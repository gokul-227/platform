import type {
  Permit,
  PlatformErrorSpec,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import { PlatformError, ValidationErrors } from "@aec-craft/platform-contracts";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { eq } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { AuthorizationService } from "../authorization.service";
import { type Database, DatabaseToken } from "../database/database.module";
import { resolveScopeRef } from "../scope";
import type { PermitRequest } from "./scope.permit.guard";

export const RequiredRowPermitMetadataKey = Symbol.for(
  "@aec-craft/platform-authorization:required-row-permit"
);

/**
 * Which table the route's id lives in, and how a miss reads.
 *
 * The table is passed in rather than known here, so this package still names no
 * resource of its own. `ownedBy` adds a row-level constraint on top of the group
 * check, for a resource that is private to one person rather than shared by a
 * partition.
 */
export interface RowPermitSource {
  /** The id path parameter. Defaults to the table's `id` column name. */
  idParam?: string;
  notFound: PlatformErrorSpec;
  /** A column that must equal the caller's subject, for a private resource. */
  ownedBy?: PgColumn;
  table: PgTable & {
    groupId: PgColumn;
    id: PgColumn;
    orgId: PgColumn;
    projectId: PgColumn;
  };
}

export interface RequiredRowPermit extends RowPermitSource {
  permit: Permit;
}

/**
 * Job B: the URL names a row, and the row knows its scope.
 *
 *   @Get(":fileId")
 *   @RequireRowPermit("read", { table: file, notFound: FileErrors.NOT_FOUND })
 *
 * Declared per route; the source is usually the same for every route in a
 * controller, so it can also sit on the class with each route naming only its
 * permit.
 */
export const RequireRowPermit = (
  permit: Permit,
  source: RowPermitSource
): MethodDecorator & ClassDecorator =>
  SetMetadata(RequiredRowPermitMetadataKey, { permit, ...source });

/**
 * Reads the row's scope columns, authorizes against the group it carries, and
 * leaves the resolved scope on the request.
 *
 * A miss and a denial answer the same `notFound`, so a caller cannot tell a row
 * that is absent from one they may not see. The row is read here and again in
 * the handler: one indexed lookup, against every service growing its own check.
 *
 * A route with an id resolves from the row; one without (a list or a create on
 * the same controller) falls back to the scope the request names, which is job A
 * with this route's masking.
 */
@Injectable()
export class RowPermitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthorizationService)
    private readonly checks: AuthorizationService,
    @Inject(DatabaseToken) private readonly db: Database
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      RequiredRowPermit | undefined
    >(RequiredRowPermitMetadataKey, [context.getHandler(), context.getClass()]);
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PermitRequest>();
    const principal = request.principal;
    if (!principal) {
      throw new PlatformError(ValidationErrors.FAILED);
    }

    const { table, notFound, ownedBy, permit } = required;
    const id = request.params[required.idParam ?? "id"];
    if (id === undefined || id.length === 0) {
      const scope = await this.checks.scopeFor(resolveScopeRef(request));
      await this.checks.assertCan(principal, permit, scope.groupId);
      request.resolvedScope = scope;
      return true;
    }

    const rows = await this.db
      .select({
        groupId: table.groupId,
        orgId: table.orgId,
        owner: ownedBy ?? table.id,
        projectId: table.projectId,
      })
      .from(table)
      .where(eq(table.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(notFound);
    }

    request.resolvedScope = await this.checks.assertCanRow(
      principal,
      permit,
      row as ResolvedScope,
      notFound
    );
    if (ownedBy && row.owner !== principal.subject) {
      throw new PlatformError(notFound);
    }
    return true;
  }
}

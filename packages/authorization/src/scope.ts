import type {
  PlatformErrorSpec,
  ResolvedScope,
} from "@aec-craft/platform-contracts";
import { PlatformError, ValidationErrors } from "@aec-craft/platform-contracts";
import { and, eq } from "drizzle-orm";
import { AuthorizationKernelErrors } from "./authorization.errors";
import type { Config } from "./config/config";
import type { Database } from "./database/database.module";
import { group } from "./database/schema";

/**
 * Where "here" is: turning what a request named into the one group id a check
 * takes.
 *
 * A request names its scope three ways and they all end at a group. A parsing
 * shape, not a domain type.
 */
export type ScopeRef =
  | { type: "org"; orgId: string }
  | { type: "project"; projectId: string }
  | { type: "group"; groupId: string };

/** The request fields a scope can be read from, path or query alike. */
export interface ScopeRequest {
  body?: unknown;
  params: Record<string, string | undefined>;
  query: Record<string, unknown>;
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * A scope in a create body. The narrower id wins: a body naming both is a
 * project write, one naming only an org is an org write. `type` is not read,
 * because a guard asks before the body has been validated.
 */
function narrowScope(value: unknown): ScopeRef | undefined {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const scope = value as Record<string, unknown>;
  const projectId = text(scope.projectId);
  if (projectId) {
    return { type: "project", projectId };
  }
  const orgId = scope.projectId == null ? text(scope.orgId) : undefined;
  return orgId ? { type: "org", orgId } : undefined;
}

function readPath(request: ScopeRequest, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)[key]
          : undefined,
      request
    );
}

/**
 * The scope a request names, wherever it named it: a group id wins, then a
 * scope in the body, then the project or org from the path or the query.
 *
 * Guards run before the validation pipe, so this reads the raw request. A
 * request naming none is refused here rather than reaching a handler that would
 * have to guess.
 */
export function resolveScopeRef(
  request: ScopeRequest,
  from?: string
): ScopeRef {
  if (from) {
    const value = readPath(request, from);
    const groupId = text(value);
    if (groupId) {
      return { type: "group", groupId };
    }
    throw new PlatformError(
      ValidationErrors.FAILED,
      `Expected a group id at '${from}'`
    );
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const explicit =
    text(request.params.groupId) ??
    text(body.groupId) ??
    text(request.query.groupId);
  if (explicit) {
    return { type: "group", groupId: explicit };
  }

  const scope = narrowScope(body.scope);
  if (scope) {
    return scope;
  }

  const projectId =
    text(request.params.projectId) ?? text(request.query.projectId);
  if (projectId) {
    return { type: "project", projectId };
  }
  const orgId = text(request.params.orgId) ?? text(request.query.orgId);
  if (orgId) {
    return { type: "org", orgId };
  }

  throw new PlatformError(
    ValidationErrors.FAILED,
    "The request names no group, org or project to authorize against."
  );
}

/**
 * The not-found a caller should see, named for what they asked about. The host
 * supplies the vocabulary (`forRoot({ masks })`); this package only picks by ref
 * type. Naming a group in the answer would leak that one sits behind every org,
 * so a group ref has no mask to pick and takes the generic one.
 */
export function missingFor(config: Config, ref: ScopeRef): PlatformErrorSpec {
  if (ref.type === "group") {
    return AuthorizationKernelErrors.NOT_FOUND;
  }
  return config.masks[ref.type] ?? AuthorizationKernelErrors.NOT_FOUND;
}

function scopeQuery(
  db: Database,
  ref: ScopeRef
): PromiseLike<Array<{ id: string; orgId: string; projectId: string | null }>> {
  const columns = {
    id: group.id,
    orgId: group.orgId,
    projectId: group.projectId,
  };
  if (ref.type === "group") {
    return db
      .select(columns)
      .from(group)
      .where(eq(group.id, ref.groupId))
      .limit(1);
  }
  if (ref.type === "org") {
    return db
      .select(columns)
      .from(group)
      .where(and(eq(group.orgId, ref.orgId), eq(group.type, "org")))
      .limit(1);
  }
  return db
    .select(columns)
    .from(group)
    .where(and(eq(group.projectId, ref.projectId), eq(group.type, "project")))
    .limit(1);
}

/** The whole scope behind a reference in one query: tenant, project, group. */
export async function scopeFor(
  db: Database,
  config: Config,
  ref: ScopeRef
): Promise<ResolvedScope> {
  const rows = await scopeQuery(db, ref);
  const row = rows[0];
  if (!row) {
    throw new PlatformError(missingFor(config, ref));
  }
  return { groupId: row.id, orgId: row.orgId, projectId: row.projectId };
}

/**
 * The scope a row lands in on a nested create, where the URL fixes the
 * partition and a body `groupId` names the owner. The partition never comes from
 * the owner, or a group id in a body could move the row into another project
 * while the URL still claimed this one.
 *
 * A cross-tenant owner is refused as a missing group. Within the tenant the two
 * are independent: a contractor's import lives in the project and belongs to the
 * contractor.
 */
export async function scopeIn(
  db: Database,
  config: Config,
  ref: ScopeRef,
  ownerGroupId?: string | undefined
): Promise<ResolvedScope> {
  const partition = await scopeFor(db, config, ref);
  if (!ownerGroupId || ownerGroupId === partition.groupId) {
    return partition;
  }
  const owner = await scopeFor(db, config, {
    type: "group",
    groupId: ownerGroupId,
  });
  if (owner.orgId !== partition.orgId) {
    throw new PlatformError(
      missingFor(config, { type: "group", groupId: ownerGroupId })
    );
  }
  return { ...partition, groupId: owner.groupId };
}

/** The group a request named, by id or through the scope that owns one. */
export async function resolveGroup(
  db: Database,
  config: Config,
  ref: ScopeRef
): Promise<string> {
  if (ref.type === "group") {
    return ref.groupId;
  }
  const rows = await scopeQuery(db, ref);
  const row = rows[0];
  if (!row) {
    throw new PlatformError(missingFor(config, ref));
  }
  return row.id;
}

import type {
  Permit,
  PlatformErrorSpec,
  ResolvedScope,
  ScopedRow,
} from "@aec-craft/platform-contracts";
import {
  AuthorizationErrors,
  PlatformError,
} from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { memoizePerRequest } from "./cache";
import type { KetoClient } from "./keto/keto.client";
import { permitCheck } from "./keto/keto.tuples";

/**
 * May they: every verdict in the platform, asked of Keto one group at a time.
 *
 * The grain is the group and never the row, so a 5,000-node changeset dedupes to
 * the two or three groups those nodes belong to. Keto is the only authority:
 * `read` unions viewers with `write` and `write` walks the parent chain, so
 * deciding in SQL would be the model restated in a second language.
 */
export function can(
  keto: KetoClient,
  principal: Principal,
  permit: Permit,
  groupId: string
): Promise<boolean> {
  return memoizePerRequest(
    `can|${principal.subject}|${permit}|${groupId}`,
    () => keto.check(permitCheck(groupId, permit, principal.subject))
  );
}

/** As `can`, refusing with 403 rather than answering false. */
export async function assertCan(
  keto: KetoClient,
  principal: Principal,
  permit: Permit,
  groupId: string
): Promise<void> {
  if (!(await can(keto, principal, permit, groupId))) {
    throw new PlatformError(AuthorizationErrors.FORBIDDEN);
  }
}

/**
 * As `assertCan`, masking a denial as the resource's own not-found. A 403 on a
 * real id and a 404 on an invented one turns any route into an oracle for which
 * ids exist, and existence is customer data.
 *
 * Conditional, not blanket: a caller holding `read` already knows the row is
 * there, so 403 on their write is honest and a 404 would cost them a session.
 */
export async function assertCanOrMask(
  keto: KetoClient,
  principal: Principal,
  permit: Permit,
  groupId: string,
  notFound: PlatformErrorSpec
): Promise<void> {
  if (await can(keto, principal, permit, groupId)) {
    return;
  }
  if (permit !== "read" && (await can(keto, principal, "read", groupId))) {
    throw new PlatformError(AuthorizationErrors.FORBIDDEN);
  }
  throw new PlatformError(notFound);
}

/** Every group must clear the permit. Dedupes, so a batch costs distinct groups
 * rather than rows. */
export async function assertCanAll(
  keto: KetoClient,
  principal: Principal,
  permit: Permit,
  groupIds: readonly string[]
): Promise<void> {
  const distinct = [...new Set(groupIds)];
  const verdicts = await Promise.all(
    distinct.map((groupId) => can(keto, principal, permit, groupId))
  );
  if (verdicts.some((allowed) => !allowed)) {
    throw new PlatformError(AuthorizationErrors.FORBIDDEN);
  }
}

/** The by-id tail: authorize against the group the row carries, masking a denial
 * as the resource's own not-found. */
export async function assertCanRow(
  keto: KetoClient,
  principal: Principal,
  permit: Permit,
  row: ScopedRow,
  notFound: PlatformErrorSpec
): Promise<ResolvedScope> {
  if (!(await can(keto, principal, permit, row.groupId))) {
    throw new PlatformError(notFound);
  }
  return { groupId: row.groupId, orgId: row.orgId, projectId: row.projectId };
}

/** Every permit at once, for a surface deciding which buttons exist. */
export async function permitsOn(
  keto: KetoClient,
  principal: Principal,
  groupId: string
): Promise<Record<Permit, boolean>> {
  const [read, write, manage, admin, own] = await Promise.all([
    can(keto, principal, "read", groupId),
    can(keto, principal, "write", groupId),
    can(keto, principal, "manage", groupId),
    can(keto, principal, "admin", groupId),
    can(keto, principal, "own", groupId),
  ]);
  return { read, write, manage, admin, own };
}

import type {
  CallerStanding,
  GroupStanding,
  Permit,
  PlatformErrorSpec,
  ResolvedScope,
  ScopedRow,
} from "@aec-craft/platform-contracts";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import { Inject, Injectable } from "@nestjs/common";
import { type Config, ConfigToken } from "./config/config";
import { type Database, DatabaseToken } from "./database/database.module";
import type { GroupRow } from "./database/schema";
import { KetoClient } from "./keto/keto.client";
import type { RelationTuple, TupleDelta } from "./keto/keto.tuples";
import * as permit from "./permit";
import * as readable from "./readable";
import * as scope from "./scope";
import * as tree from "./tree";

/**
 * The three questions a route can ask, in one injectable: where is "here"
 * (`scope.ts`), may they (`permit.ts`), and what may they see (`readable.ts`).
 * `tree.ts` is the store all three read, exposed for the two packages that
 * compose a partition's group into their own transaction.
 *
 * A facade rather than an implementation, so each question can be read on its
 * own and the callers keep one dependency.
 */
@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(KetoClient) private readonly keto: KetoClient,
    @Inject(ConfigToken) private readonly config: Config
  ) {}

  // ── may they ──────────────────────────────────────────────────────────────

  can(principal: Principal, p: Permit, groupId: string): Promise<boolean> {
    return permit.can(this.keto, principal, p, groupId);
  }

  assertCan(principal: Principal, p: Permit, groupId: string): Promise<void> {
    return permit.assertCan(this.keto, principal, p, groupId);
  }

  assertCanOrMask(
    principal: Principal,
    p: Permit,
    groupId: string,
    notFound: PlatformErrorSpec
  ): Promise<void> {
    return permit.assertCanOrMask(this.keto, principal, p, groupId, notFound);
  }

  assertCanAll(
    principal: Principal,
    p: Permit,
    groupIds: readonly string[]
  ): Promise<void> {
    return permit.assertCanAll(this.keto, principal, p, groupIds);
  }

  assertCanRow(
    principal: Principal,
    p: Permit,
    row: ScopedRow,
    notFound: PlatformErrorSpec
  ): Promise<ResolvedScope> {
    return permit.assertCanRow(this.keto, principal, p, row, notFound);
  }

  permitsOn(
    principal: Principal,
    groupId: string
  ): Promise<Record<Permit, boolean>> {
    return permit.permitsOn(this.keto, principal, groupId);
  }

  // ── what may they see ─────────────────────────────────────────────────────

  readableGroups(
    principal: Principal,
    within: { orgId?: string | null; projectId?: string | null }
  ): Promise<string[]> {
    return readable.readableGroups(this.db, this.keto, principal, within);
  }

  readableProjects(
    principal: Principal,
    options: { orgId?: string | undefined } = {}
  ): Promise<string[]> {
    return readable.readableProjects(this.db, this.keto, principal, options);
  }

  readableOrgs(principal: Principal): Promise<string[]> {
    return readable.readableOrgs(this.db, this.keto, principal);
  }

  // ── where is "here" ───────────────────────────────────────────────────────

  missingFor(ref: scope.ScopeRef): PlatformErrorSpec {
    return scope.missingFor(this.config, ref);
  }

  scopeFor(ref: scope.ScopeRef): Promise<ResolvedScope> {
    return scope.scopeFor(this.db, this.config, ref);
  }

  scopeIn(
    ref: scope.ScopeRef,
    ownerGroupId?: string | undefined
  ): Promise<ResolvedScope> {
    return scope.scopeIn(this.db, this.config, ref, ownerGroupId);
  }

  resolveGroup(ref: scope.ScopeRef): Promise<string> {
    return scope.resolveGroup(this.db, this.config, ref);
  }

  // ── the tree itself ───────────────────────────────────────────────────────

  findGroup(groupId: string): Promise<GroupRow | null> {
    return tree.findGroup(this.db, groupId);
  }

  loadGroup(groupId: string): Promise<GroupRow> {
    return tree.loadGroup(this.db, groupId);
  }

  ancestorsOf(row: GroupRow): Promise<GroupRow[]> {
    return tree.ancestorsOf(this.db, row);
  }

  tuplesOn(groupId: string): Promise<RelationTuple[]> {
    return this.keto.list({ object: groupId });
  }

  subjectsIn(
    groupId: string
  ): Promise<
    Array<{ groupId: string; subject: string; standing: GroupStanding }>
  > {
    return tree.subjectsIn(this.keto, groupId);
  }

  standingOn(groupId: string, subject: string): Promise<GroupStanding | null> {
    return tree.standingOn(this.keto, groupId, subject);
  }

  groupsOf(subject: string): Promise<string[]> {
    return tree.groupsOf(this.keto, subject);
  }

  hasOwnerAbove(row: GroupRow): Promise<boolean> {
    return tree.hasOwnerAbove(this.db, this.keto, row);
  }

  soleOwnerships(
    subject: string
  ): Promise<Array<{ id: string; name: string }>> {
    return tree.soleOwnerships(this.db, this.keto, subject);
  }

  revokeAllFor(subject: string): Promise<void> {
    return tree.revokeAllFor(this.keto, subject);
  }

  standingsOf(principal: Principal, orgId?: string): Promise<CallerStanding[]> {
    return tree.standingsOf(this.db, this.keto, principal, orgId);
  }

  createGroup(
    tx: tree.GroupWriteExecutor,
    input: Parameters<typeof tree.createGroup>[2]
  ): Promise<GroupRow> {
    return tree.createGroup(tx, this.keto, input);
  }

  deleteOrgTree(tx: tree.GroupWriteExecutor, orgId: string): Promise<void> {
    return tree.deleteOrgTree(this.db, tx, this.keto, orgId);
  }

  deleteProjectTree(
    tx: tree.GroupWriteExecutor,
    projectId: string
  ): Promise<void> {
    return tree.deleteProjectTree(this.db, tx, this.keto, projectId);
  }

  /** Writes the standings themselves. The ceiling and the audit row are the
   * caller's: a tuple carries neither. */
  patchTuples(deltas: readonly TupleDelta[]): Promise<void> {
    return this.keto.patch([...deltas]);
  }
}

import { randomUUID } from "node:crypto";
import type { Database as AuditDatabase } from "@aec-craft/platform-audit-api";
import {
  type AuditPayload,
  type AuditWriteExecutor,
  AuditWriter,
} from "@aec-craft/platform-audit-api";
import { AuditEventService } from "@aec-craft/platform-audit-api/nest";
import type { Database as AuthorizationDatabase } from "@aec-craft/platform-authorization";
import { KetoClient, parseConfig } from "@aec-craft/platform-authorization";
import { AuthorizationService } from "@aec-craft/platform-authorization/nest";
import type {
  AuditAction,
  GraphEdgeOp,
  GraphEdgeResponse,
  GraphNodeOp,
  GraphNodeResponse,
  GroupStanding,
  OrgResponse,
  ProjectResponse,
  ResolvedScope,
  ThreadResponse,
  UserResponse,
} from "@aec-craft/platform-contracts";
import type { Database as GraphDatabase } from "@aec-craft/platform-graph-api";
import {
  GraphBatchService,
  GraphEdgeBatchService,
  GraphEdgeService,
  GraphNodeBatchService,
  GraphNodeService,
  GraphVersionService,
  GraphVocabularyService,
} from "@aec-craft/platform-graph-api/nest";
import type { Principal } from "@aec-craft/platform-id-resource-nestjs";
import type { Database as TenancyDatabase } from "@aec-craft/platform-tenancy-api";
import { OrgErrors, ProjectErrors } from "@aec-craft/platform-tenancy-api";
import {
  MemberService,
  OrgMetadataService,
  OrgService,
  ProjectMetadataService,
  ProjectService,
} from "@aec-craft/platform-tenancy-api/nest";
import type { Database as ThreadsDatabase } from "@aec-craft/platform-threads-api";
import {
  ThreadMessageService,
  ThreadMetadataService,
  ThreadRunMetadataService,
  ThreadRunService,
  ThreadService,
} from "@aec-craft/platform-threads-api/nest";
import type {
  ActorPrincipal,
  Database as UsersDatabase,
} from "@aec-craft/platform-users-api";
import {
  MeMetadataService,
  MeService,
  PrincipalUserService,
  UserService,
} from "@aec-craft/platform-users-api/nest";
import { sql } from "drizzle-orm";
import { dbUrl } from "./db";

/**
 * Service bundle constructed against real drizzle instances. Mirrors the
 * wiring Nest's DI would do, but in plain TS so service-level tests don't pay
 * the Nest boot cost. The container approach keeps the `@Injectable()`
 * constructors honest — if a service ever takes a new dep, the bundle won't
 * compile.
 */
export interface Services {
  authorizationDb: AuthorizationDatabase;
  batch: GraphBatchService;
  checks: AuthorizationService;
  edgeBatch: GraphEdgeBatchService;
  edges: GraphEdgeService;
  graphVersions: GraphVersionService;
  graphVocabulary: GraphVocabularyService;
  me: MeService;
  meMetadata: MeMetadataService;
  members: MemberService;
  nodeBatch: GraphNodeBatchService;
  nodes: GraphNodeService;
  orgs: OrgService;
  orgsMetadata: OrgMetadataService;
  projects: ProjectService;
  projectsMetadata: ProjectMetadataService;
  users: UserService;
}

/**
 * Wired against the real Keto, not a stub.
 *
 * These suites exist to check that authorization behaves, and a stubbed
 * permission store answers whatever the stub was told to — it would assert the
 * fixture rather than the model. The permit traversal (`write` reaching a
 * project through its parent, `read` arriving only through a roster grant) is
 * the interesting part and it lives in the OPL, not in our code.
 */
export function buildServices(
  db: GraphDatabase,
  tenancyDb: TenancyDatabase,
  usersDb: UsersDatabase,
  authorizationDb: AuthorizationDatabase
): Services {
  // Same platform database, viewed through each package's own drizzle schema.
  const graphDb = db;
  const audit = new AuditWriter();
  const graphVocabulary = new GraphVocabularyService();
  const graphVersions = new GraphVersionService(graphDb);
  const keto = new KetoClient({
    readUrl: process.env.KETO_READ_URL ?? "http://localhost:4466",
    writeUrl: process.env.KETO_WRITE_URL ?? "http://localhost:4467",
    identityTokens: false,
    timeoutMs: 5000,
  });
  // The same masks the harness app binds: a service-level test must see the
  // resource-shaped 404 a route would answer, not the generic fallback.
  // Through `parseConfig` rather than as a literal: the resolved config is what
  // the service takes, so a hand-written one has to be updated by hand every
  // time the schema gains a defaulted field, and only the build says so.
  const checks = new AuthorizationService(
    authorizationDb,
    keto,
    parseConfig({
      databaseUrl: dbUrl(),
      ketoReadUrl: process.env.KETO_READ_URL ?? "http://localhost:4466",
      ketoWriteUrl: process.env.KETO_WRITE_URL ?? "http://localhost:4467",
      ketoIdentityTokens: false,
      ketoTimeoutMs: 5000,
      masks: {
        org: OrgErrors.NOT_FOUND,
        project: ProjectErrors.NOT_FOUND,
      },
    })
  );
  const members = new MemberService(tenancyDb, checks, audit);
  const principals = new PrincipalUserService(usersDb);
  const nodeBatch = new GraphNodeBatchService(graphVocabulary, graphVersions);
  const edgeBatch = new GraphEdgeBatchService(graphVocabulary, graphVersions);
  const batch = new GraphBatchService(graphDb, nodeBatch, edgeBatch);
  const users = new UserService(usersDb, checks);
  return {
    authorizationDb,
    users,
    me: new MeService(usersDb, users, principals),
    checks,
    members,
    orgs: new OrgService(tenancyDb, checks, audit),
    projects: new ProjectService(tenancyDb, checks, audit),
    meMetadata: new MeMetadataService(usersDb, principals),
    orgsMetadata: new OrgMetadataService(tenancyDb, audit, checks),
    projectsMetadata: new ProjectMetadataService(tenancyDb, audit, checks),
    nodes: new GraphNodeService(graphDb, checks),
    edges: new GraphEdgeService(graphDb),
    nodeBatch,
    edgeBatch,
    batch,
    graphVocabulary,
    graphVersions,
  };
}

/**
 * A caller, as a verified token would assert them. `subject` is the whole of what
 * authorization reads, so a fixture needs nothing else to be a real principal.
 */
export function asPrincipal(
  subject: string,
  overrides: Partial<Principal> = {}
): Principal {
  return {
    aal: "aal1",
    claims: {},
    clientId: null,
    email: null,
    staffRole: null,
    subject,
    type: "user",
    ...overrides,
  };
}

let userSeq = 0;
let orgSeq = 0;
let projectSeq = 0;

/** Reset the counters between tests so suite output is stable. */
export function resetSeq(): void {
  userSeq = 0;
  orgSeq = 0;
  projectSeq = 0;
}

/**
 * A fixture person: the profile row plus the principal that names them.
 *
 * `subject` is the interesting field. Authorization never reads `id`, so a test
 * that grants a standing and then acts passes the principal, and the row is
 * only there for the surfaces that render a name.
 */
export interface TestUser extends UserResponse {
  principal: Principal;
  subject: string;
}

/**
 * Create a profile the way the identity provider's webhook does. The subject
 * stands in for a Kratos identity id and is a uuid, because the columns that
 * hold a person's subject are compared against real ones elsewhere.
 */
export async function makeUser(
  _db: GraphDatabase,
  services: Services,
  overrides: {
    email?: string;
    name?: string;
    staffRole?: string;
    subject?: string;
  } = {}
): Promise<TestUser> {
  userSeq += 1;
  const subject = overrides.subject ?? randomUUID();
  const email = overrides.email ?? `user-${userSeq}-${subject}@example.test`;
  const created = await services.users.upsertByExternalId({
    externalId: subject,
    email,
    name: overrides.name ?? `User ${userSeq}`,
  });
  return {
    ...created,
    subject,
    principal: asPrincipal(subject, {
      email,
      // Shaped like the token a staff caller actually arrives with: the gate
      // wants the schema and `aal2` beside the role, not the role alone.
      ...(overrides.staffRole
        ? {
            aal: "aal2",
            claims: { ext: { schema: "staff" } },
            staffRole: overrides.staffRole,
          }
        : {}),
    }),
  };
}

/** An org and its root group, with `owner` as the group's first owner. */
export async function makeOrg(
  services: Services,
  owner: Principal,
  overrides: { name?: string; slug?: string } = {}
): Promise<OrgResponse> {
  orgSeq += 1;
  return services.orgs.create(owner, {
    name: overrides.name ?? `Org ${orgSeq}`,
    ...(overrides.slug ? { slug: overrides.slug } : {}),
  });
}

/**
 * A project, its group under the org's root, and the roster joins that let org
 * staff reach it. The creator needs `admin` on the org, which `makeOrg` gives
 * whoever created it.
 */
export async function makeProject(
  services: Services,
  orgId: string,
  creator: Principal,
  overrides: { name?: string; slug?: string } = {}
): Promise<ProjectResponse> {
  projectSeq += 1;
  return services.projects.create(orgId, creator, {
    name: overrides.name ?? `Project ${projectSeq}`,
    ...(overrides.slug ? { slug: overrides.slug } : {}),
  });
}

/**
 * The resolved scope for an org or a project, group included.
 *
 * Tests used to write the scope as a literal. They cannot any more, and that is
 * the point: a scope now carries the group that authorizes it, and a literal
 * would let a test invent one that no check would agree with.
 */
export async function orgScope(
  services: Services,
  orgId: string
): Promise<ResolvedScope> {
  return await services.checks.scopeFor({ type: "org", orgId });
}

export async function projectScope(
  services: Services,
  projectId: string
): Promise<ResolvedScope> {
  return await services.checks.scopeFor({ type: "project", projectId });
}

/** The group backing an org or a project, for a test that grants on it. */
export async function groupOf(
  services: Services,
  scope: { orgId: string } | { projectId: string }
): Promise<string> {
  return await services.checks.resolveGroup(
    "orgId" in scope
      ? { type: "org", orgId: scope.orgId }
      : { type: "project", projectId: scope.projectId }
  );
}

/** Give a subject a standing, through the same path a request would take. */
export async function grantStanding(
  services: Services,
  granter: Principal,
  groupId: string,
  subject: string,
  standing: GroupStanding
): Promise<void> {
  await services.members.setStanding(granter, groupId, subject, standing);
}

// ── Graph write helpers ────────────────────────────────────────────────────
// Single-op wrappers over the transactional changeset (`GraphBatchService`),
// so tests can write one node/edge at a time the way the old single-entity
// services let them, while every write actually goes through the batch path.

type NodeCreateFields = Omit<Extract<GraphNodeOp, { op: "create" }>, "op">;
type NodeUpdateFields = Omit<
  Extract<GraphNodeOp, { op: "update" }>,
  "op" | "id"
>;
type EdgeCreateFields = Omit<Extract<GraphEdgeOp, { op: "create" }>, "op">;
type EdgeUpdateFields = Omit<
  Extract<GraphEdgeOp, { op: "update" }>,
  "op" | "id"
>;

export async function createNode(
  services: Services,
  scope: ResolvedScope,
  fields: NodeCreateFields,
  actor: ActorPrincipal | null = null
): Promise<GraphNodeResponse> {
  const res = await services.batch.applyChangeset(
    scope,
    { nodes: [{ op: "create", ...fields }], edges: [] },
    actor
  );
  return res.nodes.items[0]!;
}

export async function updateNode(
  services: Services,
  scope: ResolvedScope,
  id: string,
  patch: NodeUpdateFields,
  actor: ActorPrincipal | null = null
): Promise<GraphNodeResponse> {
  const res = await services.batch.applyChangeset(
    scope,
    { nodes: [{ op: "update", id, ...patch }], edges: [] },
    actor
  );
  return res.nodes.items[0]!;
}

export async function deleteNode(
  services: Services,
  scope: ResolvedScope,
  id: string,
  actor: ActorPrincipal | null = null
): Promise<void> {
  await services.batch.applyChangeset(
    scope,
    { nodes: [{ op: "delete", id }], edges: [] },
    actor
  );
}

export async function createEdge(
  services: Services,
  scope: ResolvedScope,
  fields: EdgeCreateFields,
  actor: ActorPrincipal | null = null
): Promise<GraphEdgeResponse> {
  const res = await services.batch.applyChangeset(
    scope,
    { nodes: [], edges: [{ op: "create", ...fields }] },
    actor
  );
  return res.edges.items[0]!;
}

export async function updateEdge(
  services: Services,
  scope: ResolvedScope,
  id: string,
  patch: EdgeUpdateFields,
  actor: ActorPrincipal | null = null
): Promise<GraphEdgeResponse> {
  const res = await services.batch.applyChangeset(
    scope,
    { nodes: [], edges: [{ op: "update", id, ...patch }] },
    actor
  );
  return res.edges.items[0]!;
}

export async function deleteEdge(
  services: Services,
  scope: ResolvedScope,
  id: string,
  actor: ActorPrincipal | null = null
): Promise<void> {
  await services.batch.applyChangeset(
    scope,
    { nodes: [], edges: [{ op: "delete", id }] },
    actor
  );
}

/**
 * Every group in the test database.
 *
 * List queries now take the set of groups the caller may read, and these suites
 * are about filtering and pagination rather than about who may see what. Passing
 * everything keeps that filter a no-op here; the authorization suites assert it
 * directly instead.
 */
export async function allGroups(services: Services): Promise<string[]> {
  const result = await services.authorizationDb.execute<{ id: string }>(
    sql`select id from "group"`
  );
  return result.rows.map((row) => row.id);
}

// ── Thread service bundle ──────────────────────────────────────────────────
// Same plain-TS wiring as `buildServices`, over the threads package's own
// drizzle view of the shared test database. The run worker is deliberately
// absent: without `config.llm` it is dormant in the test host anyway, and the
// lifecycle services are the full client-visible surface.

export interface ThreadServices {
  messages: ThreadMessageService;
  metadata: ThreadMetadataService;
  runMetadata: ThreadRunMetadataService;
  runs: ThreadRunService;
  threads: ThreadService;
}

export function buildThreadServices(
  threadsDb: ThreadsDatabase
): ThreadServices {
  return {
    threads: new ThreadService(threadsDb),
    messages: new ThreadMessageService(threadsDb),
    metadata: new ThreadMetadataService(threadsDb),
    runs: new ThreadRunService(threadsDb),
    runMetadata: new ThreadRunMetadataService(threadsDb),
  };
}

export async function makeThread(
  threads: ThreadService,
  scope: ResolvedScope,
  ownerId: string,
  overrides: { title?: string; metadata?: Record<string, unknown> } = {}
): Promise<ThreadResponse> {
  return threads.create(
    scope,
    {
      title: overrides.title ?? "Test thread",
      ...(overrides.metadata ? { metadata: overrides.metadata } : {}),
    },
    ownerId
  );
}

// ── Audit read side ────────────────────────────────────────────────────────
// Rows are written by each slice inside its own transaction, so a test that
// exercises the feed writes them the same way: through `AuditWriter`, over the
// audit package's own drizzle view of the shared test database.

export type AuditEventFields = AuditAction & {
  actorId?: string | null;
  actorType?: string;
  context?: Record<string, unknown>;
  groupId: string;
  label?: string;
  orgId?: string | null;
  payload?: AuditPayload | null;
  projectId?: string | null;
  resourceId: string;
};

export function buildAuditService(auditDb: AuditDatabase): AuditEventService {
  return new AuditEventService(auditDb);
}

export async function recordAuditEvent(
  auditDb: AuditDatabase,
  fields: AuditEventFields
): Promise<void> {
  await new AuditWriter().record(auditDb as unknown as AuditWriteExecutor, {
    ...fields,
    actorId: fields.actorId ?? null,
    actorType: fields.actorType ?? "user",
    label: fields.label ?? "Fixture",
  });
}

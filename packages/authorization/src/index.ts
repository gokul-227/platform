// `@aec-craft/platform-authorization` core export: framework-neutral surface.
// NestJS bindings live at `@aec-craft/platform-authorization/nest`.
//
// Answers one question, may this caller do this here, and owns the two stores
// that answer it: the `group` table and the Keto tuples. Serves no routes. A
// group is created and destroyed with the org or the project it backs, which
// tenancy-api does inside its own transaction through `createGroup` here.
//
// The vocabulary (standings, permits, the group wire shapes) lives in
// `@aec-craft/platform-contracts`, so the scope predicates and the SDK can read
// it without depending on this package.

// ── Config ──────────────────────────────────────────────────────────────────
export { AuthorizationKernelErrors } from "./authorization.errors";
export {
  type Config,
  type ConfigInput,
  ConfigToken,
  parseConfig,
} from "./config/config";
// ── Database (drizzle schema) ───────────────────────────────────────────────
export type { Database } from "./database/database.module";
export {
  type GroupRow,
  group,
  type NewGroupRow,
} from "./database/schema";
// ── Keto ────────────────────────────────────────────────────────────────────
export {
  KetoClient,
  type KetoClientOptions,
} from "./keto/keto.client";
export {
  allStandingTuples,
  GROUP_NAMESPACE,
  grantTuple,
  insert,
  isSubjectTuple,
  parentTuple,
  permitCheck,
  type RelationTuple,
  remove,
  rosterJoinTuples,
  type SubjectSet,
  standingOfRelation,
  standingTuple,
  subjectStandings,
  type TupleDelta,
  viewerJoinSources,
} from "./keto/keto.tuples";
// ── The tree ────────────────────────────────────────────────────────────────
export type { GroupWriteExecutor } from "./tree";

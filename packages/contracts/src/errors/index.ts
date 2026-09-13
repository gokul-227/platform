// `@aec-craft/platform-contracts` — the platform's failure vocabulary.
//
// Split from `@aec-craft/platform-contracts` so that package can be described in
// one sentence: the wire shapes and vocabularies of each domain. What lives here
// is the envelope every route answers with, plus the catalogues that more than
// one package throws.
//
// A catalogue with a single owner is not here. It lives with that owner —
// `GraphNodeErrors` in graph-api, `ThreadErrors` in threads-api, `FileErrors` in
// files-api — because no client switches on a code: the API answers
// `{ code, message, … }` and the caller renders it.
//
// One reason a catalogue stays in this package instead: `packages/common`
// throws it, so it cannot live above common. `AuthenticationErrors`,
// `AuthorizationErrors`, `InternalErrors`, `ValidationErrors`, and no others.
//
// The first two split what one vague `AccessErrors` used to hold: a 401 saying
// the caller is not established, and a 403 saying what an established one may
// not do. The wire codes still read `ACCESS_*` and `PERMISSION_*` because a
// `code` is an append-only contract — see AGENTS.md, Known exceptions.
//
// The authorization kernel used to force a second reason — it named
// `ORG_NOT_FOUND` and `PROJECT_NOT_FOUND` itself when masking a partition a
// caller may not see, and tenancy-api depends on the kernel, so neither package
// could own them. It no longer names either: the host passes the specs in as
// `AuthorizationModule.forRoot({ masks })`, and the three catalogues live with
// the resources they describe.
//
// Published rather than private, and it must stay externalized in every bundle.
// `PlatformExceptionFilter` identifies a failure with
// `exception instanceof PlatformError`, so a second inlined copy of the class
// would make every platform error answer 500.
//
// Exports are alphabetised by the formatter, so do not group them under
// comments here — the groups are described above instead.

export { AuthenticationErrors } from "./authentication.errors";
export { AuthorizationErrors } from "./authorization.errors";
export { InternalErrors } from "./internal.errors";
export {
  PlatformError,
  type PlatformErrorBody,
  type PlatformErrorOptions,
  type PlatformErrorSpec,
  platformErrorBodySchema,
  platformErrorSpecSchema,
  toErrorBody,
} from "./platform.error";
export { ValidationErrors } from "./validation.errors";

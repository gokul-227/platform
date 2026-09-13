# @aec-craft/platform-sdk

## 0.5.2

### Patch Changes

- Updated dependencies [[`e534e18`](https://github.com/aec-craft/platform/commit/e534e18cb4fec3525b3c9d30a119fe0537f35643)]:
  - @aec-craft/platform-contracts@0.7.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`660235b`](https://github.com/aec-craft/platform/commit/660235b1e99104a2affa259e448c1fcfc5d9101e), [`e687ddb`](https://github.com/aec-craft/platform/commit/e687ddb112e9d4c63002499dbff130db5b774d70), [`fb72e69`](https://github.com/aec-craft/platform/commit/fb72e6900e6f6bf2f0a0e407fa6ba69815f8c575)]:
  - @aec-craft/platform-contracts@0.6.0

## 0.5.0

### Minor Changes

- [#258](https://github.com/aec-craft/platform/pull/258) [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766) Thanks [@mariusjb](https://github.com/mariusjb)! - Membership is served on the organization and the project. `group` leaves the wire, and the people resolver goes with it.

  `/orgs/:orgId/members` and `/projects/:projectId/members` replace the group surface: eleven routes become eight, and the five that let a caller list, make, rename and delete a group are gone with no replacement. `GET /orgs/:orgId/people` is gone too.

  A group was never a noun a person recognises. It is how the authorization kernel stores a partition, it is created and destroyed with the org or the project it backs, and the two collections above answer the only question anybody was asking it: who is in here, and at what standing. What is left of it on the wire is `groupId` on a create body, which hands a row to somebody other than the scope's own people, and `/me/groups`, which is named for what it reads and will be renamed with it. A set of people spanning projects arrives later as **Teams**.

  The client is `client.members`, taking a scope where it used to take a group id — `client.members.list({ type: "project", projectId })` — and `client.groups.mine(orgId)` is `client.me.standings(orgId)`, which is what it always answered. The member row drops `groupId` and `via`: on a project, an inherited standing comes from the organization and from nowhere else, so `source: "inherited"` says all there was to say.

  `GROUP_MEMBER_*` codes are `MEMBER_*`, and a member route now masks an unreachable partition as `ORG_NOT_FOUND` or `PROJECT_NOT_FOUND` rather than naming a group the caller was never told about. The audit vocabulary follows: `group.created` and `group_member.added` become `member.added`, `member.updated`, `member.removed`.

  Reading the list needs `read` rather than `manage`. It is the tenant directory now — it is what puts a name to the author of a file and the actor on an audit row, which is what `/orgs/:orgId/people` used to do for surfaces held by people with `read` and nothing more. Every write still needs `manage`, plus a standing strictly below the caller's own.

- [#258](https://github.com/aec-craft/platform/pull/258) [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766) Thanks [@mariusjb](https://github.com/mariusjb)! - Objects and rules are addressed by scope, like the graph rows they are.

  `GET /objects?orgId=|projectId=` and `GET /rules?orgId=|projectId=` replace `/projects/:projectId/objects` and `/projects/:projectId/rules`, and the four extraction scaffolds move to `/rules/extractions?projectId=` — including `coverage` and `vocabulary`, which are extraction concerns rather than rule-corpus ones and now read as such.

  These are the same rows `/graph/nodes` serves, narrowed to one type, so they follow the same rule: a node carries `org_id` and `project_id` and is one table either way, which makes the scope a predicate rather than a path. The nested form also could not express the thing rules actually need — an organisation's rules are its design intent, held once and hydrated into every project — without a second route tree.

  The clients take a scope where they took a project id: `client.objects.list({ type: "project", projectId })`, `client.rules.list({ type: "org", orgId })`. `useObjects` and `useRules` take the same.

  `GRAPH_QUERY_UNAVAILABLE` is `GRAPH_UNAVAILABLE`. The projection's reachability is now `@aec-craft/platform-graph-client`'s to refuse with — the package that holds the driver — and it is not a fact about a query. What a _statement_ may say is still graph-api's: `GRAPH_QUERY_CYPHER_NOT_READ_ONLY` and `GRAPH_QUERY_CYPHER_SCOPE_VIOLATION` keep their names.

### Patch Changes

- Updated dependencies [[`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b), [`e96e3c9`](https://github.com/aec-craft/platform/commit/e96e3c926aef1f601a8a2778dd2a6be9ed51a9d9), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`4a17901`](https://github.com/aec-craft/platform/commit/4a179017bd4a7c0cd9ed15756240e7e57f183766), [`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b), [`440e340`](https://github.com/aec-craft/platform/commit/440e34037bb8ff861b33da9373d1990a5b448e3b)]:
  - @aec-craft/platform-contracts@0.5.0

## 0.4.0

### Minor Changes

- [#171](https://github.com/aec-craft/platform/pull/171) [`4d97c8f`](https://github.com/aec-craft/platform/commit/4d97c8fecfead7b8f4da917c13a85f00e91e78c1) Thanks [@mariusjb](https://github.com/mariusjb)! - The graph vocabulary is organized by node type, and each edge type declares itself.

  `graph/` becomes four concepts named by four folders. `registry/` is the kit a
  type declares itself with (`defineBlock`, `defineEdge`, the three structural
  types). `object/`, `rule/` and `source/` each declare their own class roots,
  blocks and edges and export a manifest. `vocabulary.ts` composes the three into
  `CANONICAL_NODE_TYPES`, `CANONICAL_EDGE_TYPES`, `CANONICAL_CLASS_ROOTS`,
  `CANONICAL_BLOCK_KEYS`, the classifier and `GRAPH_VOCABULARY`, so a canonical
  list cannot drift from the manifest it is built out of. `wire/` is the request
  and response surface, identical for every type. Imports are unaffected: the
  public barrel is unchanged and every existing symbol keeps its name.

  Each edge type is a file declaring itself through `defineEdge`, the twin of
  `defineBlock`: allowed endpoint classes, cardinality, whether direction carries
  meaning, whether the relation composes along a chain, and where instances come
  from. `EDGE_DEFINITIONS` exposes them by wire value. An edge belongs to the type
  at its `from` end, which is why `governs` is a rule edge though it points at
  objects. The object type gains `adjacentTo`, `connectsTo`, `hostedIn`,
  `interfaceOf` and `serves` alongside `contains` and `bounds`; `rule` declares
  `governs` and `modifies`; `source` declares `includes`, `cites`, `amends` and
  `supersedes`.

  `parentId` mirrors as two edges rather than one. `contains` is the spatial tree
  and `includes` is a document outline, because a storey contains a space in
  physical space while an act includes a § by composition, and no query means both
  at once. `containmentEdgeFor(classRoot)` returns the one that applies, and the
  projection uses it, so a spatial traversal can no longer descend into a document.

  The canonical node types are now `object`, `rule` and `source`. `requirement` and
  `reference` are no longer canonical, and neither is the `hasRequirement` edge:
  values already stored under the old names keep working and are counted as
  vocabulary drift, exactly as any other non-canonical value is.

### Patch Changes

- Updated dependencies [[`e01a1fe`](https://github.com/aec-craft/platform/commit/e01a1fef0ff581f079e69c61ced828720c2b13f9), [`4d97c8f`](https://github.com/aec-craft/platform/commit/4d97c8fecfead7b8f4da917c13a85f00e91e78c1), [`351126e`](https://github.com/aec-craft/platform/commit/351126e44f87aeb95662aa2c6b6c13ddee795cdb)]:
  - @aec-craft/platform-contracts@0.4.0

## 0.3.0

### Minor Changes

- [#157](https://github.com/aec-craft/platform/pull/157) [`9edc4ba`](https://github.com/aec-craft/platform/commit/9edc4bae23afb072fc6aea4f1eeb477eae7eda0a) Thanks [@mariusjb](https://github.com/mariusjb)! - Uploaded documents are searchable by what they say, and a model can answer from them with citations.

  Nothing is submitted for indexing. A document becomes searchable because of the preset it was uploaded under, so `pipeline` is now published on every preset: what runs once the bytes land, in order, empty meaning they are simply stored. A client reads it to know whether to offer search over these files at all. The name that admits an upload is the name that dispatches it, which is why "this deployment accepts IFC" and "this deployment does something with IFC" cannot describe different sets.

  `client.files.index` is the retrieval ladder over one scope's documents, each rung the one below it plus a step. `search` ranks chunks by meaning, so a query sentence can match a passage sharing no words with it, with an exact `filter` over the attributes a document was indexed with. `retrieve` widens those hits with the text around them and merges overlapping runs into passages under a token budget, at no extra model call. `context` formats the same passages as one string with `[n]` markers plus the sources they resolve to. `ask` answers that context with a model held to it, citing each claim and declining when retrieval found nothing. Take the lowest rung that answers your question: if you are already calling a model, `context` beats `ask`.

  `useFileSearch`, `useFileRetrieve`, `useFileContext` and `useFileAsk` on `./react` are those four as mutations; `useFileSearchQuery` is search as component state, re-running when its input changes and held by passing `input: null`.

  `file.status` gains `processing`: the bytes are confirmed and the preset's pipeline is still running. Only `pending` is unreadable, since a document being indexed has verified bytes and stays downloadable, and a pipeline that fails still reaches `ready` with the failure recorded against the step rather than the file. A client that treated `ready` as "uploaded" needs to accept the third value; one that gates downloads on `!== "pending"` is unaffected.

  `useFileIndexState` is where a single file stands, polling only while the worker still owes an answer, so a UI can say "indexing" rather than imply the file is broken. A file that was never submitted answers `FILE_INDEX_NOT_INDEXED`; that is the answer, not a fault. A deployment with no index answers 503 `FILE_INDEX_NOT_CONFIGURED` on every rung, and `ask` alone answers `FILE_INDEX_ANSWERER_NOT_CONFIGURED` when retrieval works but no answer model is configured.

### Patch Changes

- Updated dependencies [[`9edc4ba`](https://github.com/aec-craft/platform/commit/9edc4bae23afb072fc6aea4f1eeb477eae7eda0a)]:
  - @aec-craft/platform-contracts@0.3.0

## 0.2.0

### Minor Changes

- [#151](https://github.com/aec-craft/platform/pull/151) [`240e9d0`](https://github.com/aec-craft/platform/commit/240e9d075b700abec6f9c8fbc86ce7f281a664e9) Thanks [@mariusjb](https://github.com/mariusjb)! - An audit event names what it was about.

  `auditEventResponseSchema` gains `resourceLabel`: the subject of the event as it was named at the time, so a row reads "plan.ifc / file / deleted" and "Marius Bauer / standing / updated" rather than the shape of an event with an opaque id beside it. A standing change names the person, not the group, because the group is already the row's partition and whose standing changed was the question.

  Stored rather than resolved on read. Half of these events remove the row that held the name, so a delete is exactly the one whose subject cannot be looked up afterwards. Nullable, and not backfilled: a name could only be guessed for the rows written before this, and a log that guesses is worse than one that admits the name was not recorded.

  The settings audit feed puts it first, as its own Subject column.

- [#148](https://github.com/aec-craft/platform/pull/148) [`888401f`](https://github.com/aec-craft/platform/commit/888401f1020d23a84742f226e3279892ae5a446d) Thanks [@mariusjb](https://github.com/mariusjb)! - An inherited standing can be followed to the group holding it.

  The roster said "via marius1" and the row menu said "this standing comes from marius1, change it there", and neither could be acted on: the reader was given the name of the place and no way to reach it, on the one row whose menu is otherwise empty. Both are controls now, and both land on that scope's members section rather than its first section, which would drop somebody a page away from what they clicked. `setScope` and `openProject` take an optional section id for that.

  Offered only when the group is one the caller can read, they hold `manage` on it, and it is a scope settings models. Each rules out a control that would mislead: `via` names an ancestor whether or not the caller has any reach on it; the roster needs `manage` to render at all, so the button would otherwise land them somewhere else having promised the standing could be changed; and the parent chain is walked to its root, so a custom group carved out inside a project is a real source with no scope of its own. Those cases keep the sentence, which is still the honest answer.

  Resolved from the standings already fetched for the active scope, so following a reference costs no request. In the roster the reference sits under the standing rather than beside it, so a row reads as one standing and where it comes from.

- [#131](https://github.com/aec-craft/platform/pull/131) [`6f5b6e3`](https://github.com/aec-craft/platform/commit/6f5b6e3f9cda2c04f8cc94b2baee53ec2ed19b0d) Thanks [@mariusjb](https://github.com/mariusjb)! - The authorization vocabulary: groups, standings, permits, and the wire shapes for members and grants. A group is a set of users, a standing is which relation that set holds, and a resource answers to whichever group owns it rather than to a role table.

  The SDK gains the group client and its React hooks over the same surface.

- [#149](https://github.com/aec-craft/platform/pull/149) [`39c436b`](https://github.com/aec-craft/platform/commit/39c436b1a601946219ab9d8f5f66ac3208c9829e) Thanks [@mariusjb](https://github.com/mariusjb)! - The file tree is browseable: `<FileBrowser>` on `@aec-craft/platform-sdk/ui`, a frosted modal over one organization's library or one project's files, opened over any route the way `<Settings>` is.

  A folder opens a level at a time, on the request that opening it makes, and `hasChildren` decides the chevron so a leaf costs nothing to look at. Rename, move, delete, upload, download and a new folder are all on the rows and the toolbar that own them, each behind the caller's `write` permit. Scope comes from the same organization then project breadcrumb as settings, so a project shows its own files and the library it inherits is the organization's view rather than something hydrated into the project's tree.

  `useFileLevel` is the hook behind a level: offset pages, `total` on every one of them, and `fetchNextPage` for the rest. Offset rather than the cursor because `?sort` is offset-only and a level wants its own order.

  `type` on the file list is now sortable, which is what lets a level lead with its folders: `sort=type:desc&sort=name:asc`. The values order lexically, so `folder` precedes `file` descending. Additive; existing callers are unaffected and the endpoint's default sort is unchanged.

  `useCallerStanding` is exported from `./react`. It reads what the caller holds on the active org or project as permits, matched on group type and partition, and both surfaces gate their controls on it.

  `useFiles`'s query type widens to the project list input, so `scope` is reachable from the hook as it already was on the client. Its documentation said `parentId` took `eq.<id>` and `eq.null`; it takes a bare id, and the scope root is the parameter omitted.

- [#131](https://github.com/aec-craft/platform/pull/131) [`6f5b6e3`](https://github.com/aec-craft/platform/commit/6f5b6e3f9cda2c04f8cc94b2baee53ec2ed19b0d) Thanks [@mariusjb](https://github.com/mariusjb)! - A roster names everyone who reaches the group, not only those with a standing written on it.

  `GET /groups/:groupId/members` now returns the standings above the group as well as the ones on it. Each row carries `source`, either `direct` or `inherited`, and `via`, which names the group an inherited standing sits on and is null for a direct one. `groupMemberResponseSchema` gains both fields, and `memberSourceSchema` / `MemberSource` are exported alongside them.

  The reason it was wrong: every permit traverses the parent, so the org owner administers every project beneath them without a tuple on any of them. A roster of direct tuples left that person invisible on the project they were administering, and a project with one added member looked like a project with one owner.

  Which followed into the last-owner invariant, in two places. `PATCH` and `DELETE` on a member counted direct owners, so a project's only direct owner could be neither demoted nor removed, by anybody, though the org owner above them owned it the whole time. The invariant now refuses only where the group would be left with no owner anywhere above it, which is the unrecoverable case it was written for: an org, or a group deliberately made outside the tree. The same arithmetic gated user deletion through `USER_DELETE_BLOCKED_LAST_OWNER`, which no longer names a project somebody owns alone.

  An inherited standing is changed where it lives, so `DELETE /groups/:groupId/members/:subject` still answers `GROUP_MEMBER_NOT_FOUND` for somebody who only reaches the group from above.

  A viewer above is the one standing that does not simply fall down the tree: `read` traverses the parent's `write`, which never admits a viewer, so org viewers appear on a project because it was created joined to the org's roster and are absent from a group created without that join.

- [#131](https://github.com/aec-craft/platform/pull/131) [`6f5b6e3`](https://github.com/aec-craft/platform/commit/6f5b6e3f9cda2c04f8cc94b2baee53ec2ed19b0d) Thanks [@mariusjb](https://github.com/mariusjb)! - Collections hang off the org or project that owns them, and a subject can be given a name.

  **Breaking.** Files and graph collections move under their scope: `/orgs/:orgId/files`, `/projects/:projectId/files`, the same two beneath `graph/nodes` and `graph/edges`, and the changeset at `POST /orgs/:orgId/graph` and `POST /projects/:projectId/graph`. Scope leaves the wire with them — no `?orgId=` / `?projectId=`, no `scope` in a create or changeset body — so `fileListInputSchema`, `graphNodeListInputSchema`, `graphEdgeListInputSchema`, `createFileInputSchema`, `createGraphNodeInputSchema`, `createGraphEdgeInputSchema`, `graphBatchInputSchema` and `cypherQueryInputSchema` all lose fields. `?scope=project|org` survives on the project routes alone, where there are two layers to narrow between, which is why the project lists get their own input schemas.

  By-id routes stay flat (`/files/:fileId`, `/graph/nodes/:nodeId`, `/graph/edges/:edgeId`). A row's group is a column rather than its partition, so a nested by-id URL would assert the project owns a row a contractor owns, and would break again when a row moves group.

  The SDK keeps one method per operation and builds the path from the scope it already took, so most call sites are unchanged. `graph.query.run` and `graph.query.health` now take the project id as their first argument, and `graphHealthInputSchema` is gone.

  New: `GET /orgs/:orgId/people` and `client.groups.resolvePeople`, which put names to subjects a caller already holds. A group roster answers that only for direct members, and a standing reaches down the parent chain, so the person who acted on a project routinely has no membership row on it.

  The actor on an audit row, a file's author, and the graph version log's actor all become the platform's own `user.id` rather than the identity subject the gateway asserts. The subject belongs to the identity provider and changes for the same person when the provider does, so a swap would leave every historical row naming an identity nothing claims — and the mapping that could repair it is the very column the swap overwrites. All three stay nullable and free of a foreign key: a machine has a client id and no profile, and a row recording who acted has to outlive the account it names. `actorId` on the audit response is a uuid now, and the file response's `createdBy` likewise.

  The people resolver moves from the permissions package to the directory: `client.groups.resolvePeople` becomes `client.people.resolve`, and the `usePeople` hook comes with it. What comes back is a profile row, which the directory owns; whether the person belongs to the tenant is a standing, which it now asks the permissions layer through `standsInOrg` instead of reading the group table itself. The route is unchanged at `GET /orgs/:orgId/people`.

  The settings section registry is authored as groups that own their sections, and the sections that were declared but unbuilt are gone with the placeholder they rendered. `flags` and `settings` move under `src/platform/`; `./react` exports the same names.

- [#131](https://github.com/aec-craft/platform/pull/131) [`6f5b6e3`](https://github.com/aec-craft/platform/commit/6f5b6e3f9cda2c04f8cc94b2baee53ec2ed19b0d) Thanks [@mariusjb](https://github.com/mariusjb)! - One writer per profile column.

  Filed as a minor on purpose, though it breaks a caller: on a `0.x` line a caret
  does not cross a minor, so `^0.1.0` refuses `0.2.0` exactly as it would refuse
  `1.0.0`, and a consumer takes this only by asking for it. `1.0.0` stays a
  decision to make on its own rather than one an accumulated changeset makes.

  `name` and `email` are identity traits: the provider's webhook is now their only
  writer, and they are changed on the sign-in provider's account page. `picture`
  is the platform's own, because no provider has an avatar trait, so the webhook
  never touches it.

  Two things were writing each of those columns, and both of the resulting bugs
  were live. `PATCH /me` accepted a `name` that the next webhook fire reverted.
  Worse, the upsert spelled `picture` out in its update clause while the hook
  never carried one, so every fire set the column to null: changing a password
  erased the avatar.

  **Breaking.** `updateUserInputSchema` loses `name`, so `client.me.update({ name })`
  no longer typechecks; the field is stripped rather than honoured if it reaches
  the endpoint anyway. `upsertIdentityInputSchema` loses `picture`. The settings
  surface's profile section shows name and email read-only and offers the avatar
  instead.

- [#125](https://github.com/aec-craft/platform/pull/125) [`5faa931`](https://github.com/aec-craft/platform/commit/5faa93182756ab7fa7e61d2ab96613ccf5d3d8e5) Thanks [@mariusjb](https://github.com/mariusjb)! - Resumable uploads, end to end.

  `POST /files` now returns an upload ticket discriminated on `type`: a `put`
  ticket (the previous shape, plus the discriminator) for small files, and above
  the deployment's threshold whichever interruptible shape its storage backend
  speaks — `resumable` (a session URL and chunk size, GCS) or `multipart` (part
  size and signed part URLs, S3 and its compatibles). Two routes come with it — `GET /files/:fileId/upload` re-issues the
  live session so an interrupted upload continues from the committed offset, and
  `POST /files/:fileId/abort` gives up on one — plus `GET /files/presets` for
  what the deployment accepts, so a client can reject a file before sending any of it.

  A create may name the preset it wants to be held to (`preset` on `POST /files`,
  `preset` on the SDK's upload meta and on `useFileUploads`), so a per-purpose
  limit is enforced by the server and not only checked in the browser. A name the
  deployment does not offer answers `FILE_PRESET_NOT_FOUND` rather than falling
  back to `default`, which would grant more than the caller asked for.

  `client.files.upload(scope, file, meta, events)` runs the whole transfer and
  returns controls: `done`, `pause`, `resume`, `abort`, `getState`. Chunked
  transfer is what the controls rest on — pausing keeps the committed bytes, a lost
  connection parks the upload and continues on reconnect, and a deterministic
  rejection from storage (expired capability, provider size limit) fails at once
  instead of retrying into a hang. `client.files.resumeUpload(fileId, file)`
  continues an upload from a later page load. `uploadFile` keeps its signature and
  now runs on the engine.

  The upload vocabulary lives in contracts, not in the client that raises it:
  `UploadErrors` sits beside `FileErrors` so a caller switches over one catalog,
  and `FileUploadState` (the transfer's own state, which no server type models)
  ships there too. Its first state is `queued` rather than `pending`, since the
  file row and the upload session already use that word for something else.
  files-api names the content type from the extension when a client sends the
  generic one, so the guess happens where the preset check validates it instead of
  being duplicated per client.

  React gains `useFileUploads` (per-file state, pause/resume/abort/retry, offline
  flag, bytes-weighted progress) and `useFilePresets`; `./ui` gains
  `<UploadDropzone>`, `<UploadButton>` for where a drop target does not fit, and
  `<UploadAttachment>` for one upload row on its own. `useUploadFile` is unchanged.

  Removed: `uploadToTarget`, whose single-PUT signature no longer covers the ticket
  union — `client.files.upload` replaces it.

- [#151](https://github.com/aec-craft/platform/pull/151) [`240e9d0`](https://github.com/aec-craft/platform/commit/240e9d075b700abec6f9c8fbc86ce7f281a664e9) Thanks [@mariusjb](https://github.com/mariusjb)! - Files can be searched across a whole scope, not one level at a time.

  `GET /orgs/:orgId/files` and its project twin take `recursive=true`, which drops the level constraint so a name filter reaches every folder: `recursive=true&name=contains.plan` finds a folder however deep it sits. Each row then carries `path`, the ancestor folders from the scope root down to the parent, resolved in one query for the whole page rather than a walk per row. An ancestor in a group the caller cannot read is left out instead of named.

  `<FileBrowser>` has the search field this exists for. Two characters commit after typing settles, the tree becomes a flat list of hits with the matched run marked and the folders each one lives in named underneath, and clicking a hit opens the tree at that spot: `path` is what makes revealing it free, so no ancestor walk happens in the browser either.

  The audit feed searches its subject the same way, through a new `resourceLabel` filter (`eq`, `contains`) rather than in the client, because a feed cut at a page would otherwise search only the page. It also walks the whole log now by cursor, through `useOrgAuditFeed` / `useProjectAuditFeed` on `./react`, in place of a growing limit that stopped at 200 rows. Its Event and Resource filters are derived from the recorded action vocabulary, so uploads, downloads and moves are filterable; they were hardcoded to five verbs and one resource per scope.

  An organization's audit feed is its own events again. A project row carries its organization too, so every file uploaded in every project was appearing in the organization's log; it now reads `project_id IS NULL OR resource_id = project_id`, which keeps a project being created (an organization-level event) and leaves what happened inside one to that project's feed.

  A group roster row carries `userId`, the member as the platform knows them, beside the identity provider's `subject`. It is what a caller compares against `/me` — the settings member table was comparing a subject against a user id, so no row was ever recognised as your own — and the id to reference for a profile later. Null for a subject with no user row.

  `folder` is in the resource labels, so an audit row about one no longer prints the wire value in lower case.

### Patch Changes

- Updated dependencies [[`240e9d0`](https://github.com/aec-craft/platform/commit/240e9d075b700abec6f9c8fbc86ce7f281a664e9), [`6f5b6e3`](https://github.com/aec-craft/platform/commit/6f5b6e3f9cda2c04f8cc94b2baee53ec2ed19b0d), [`39c436b`](https://github.com/aec-craft/platform/commit/39c436b1a601946219ab9d8f5f66ac3208c9829e), [`6f5b6e3`](https://github.com/aec-craft/platform/commit/6f5b6e3f9cda2c04f8cc94b2baee53ec2ed19b0d), [`6f5b6e3`](https://github.com/aec-craft/platform/commit/6f5b6e3f9cda2c04f8cc94b2baee53ec2ed19b0d), [`6f5b6e3`](https://github.com/aec-craft/platform/commit/6f5b6e3f9cda2c04f8cc94b2baee53ec2ed19b0d), [`5faa931`](https://github.com/aec-craft/platform/commit/5faa93182756ab7fa7e61d2ab96613ccf5d3d8e5), [`240e9d0`](https://github.com/aec-craft/platform/commit/240e9d075b700abec6f9c8fbc86ce7f281a664e9)]:
  - @aec-craft/platform-contracts@0.2.0

## 0.1.0

First release of the reset version line ([#94](https://github.com/aec-craft/platform/pull/94)). Earlier published versions were withdrawn, so this is the baseline: there is nothing to migrate from.

The surface at this version:

- **`.`** — the typed HTTP client. Promise-based, framework-neutral, global `fetch`. Domains: `directory`, `files`, `graph`, `threads`, `audit`, over a shared `Http`. Errors surface as `PlatformError`.
- **`./react`** — TanStack Query bindings and the chat provider.
- **`./ui`** — the scope-aware `<Settings>` modal, built on `@aec-craft/ui`.
- List methods return the paged envelope described by `platform-contracts`, never a bare array: `const { items, total } = await client.orgs.list()`. Both pagination modes are available, offset by default.
- One thread stack, not two. Use `ThreadClient`, `ThreadScope`, `CreateThreadInput`, and `RequestOptions` directly. `ThreadRunClient.wait(threadId, runId, options?)` polls until a run settles, backing off on 429; `ThreadClient.session(options)` opens a session without constructing an `AgentClient`.

Built against `@aec-craft/platform-contracts@0.1.0`.

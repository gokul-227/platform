import { randomUUID } from "node:crypto";
import {
  type AuditPayload,
  type AuditWriteExecutor,
  AuditWriter,
} from "@aec-craft/platform-audit-api";
import { isUniqueViolation } from "@aec-craft/platform-common";
import {
  filterConditions,
  firstRowOrThrow,
  groupWhereReadable,
  keysetOrder,
  keysetWhere,
  scopeWhereStrict,
  scopeWhereVisible,
  sortExpressions,
  totalOver,
} from "@aec-craft/platform-common/drizzle";
import type {
  CompleteFileInput,
  CreateFileInput,
  CreateFileResponse,
  DownloadFileResponse,
  FileListResponse,
  FileResponse,
  ProjectFileListInput,
  ResolvedScope,
  UpdateFileInput,
  UploadPresetsResponse,
  UploadSessionResponse,
  UploadTicket,
} from "@aec-craft/platform-contracts";
import {
  fetchCursorPage,
  fetchOffsetPage,
  fileList,
  PlatformError,
  resolvePageQuery,
  ValidationErrors,
} from "@aec-craft/platform-contracts";
import {
  type ActorPrincipal,
  recordedActorId,
} from "@aec-craft/platform-users-api";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, isNull, lt, type SQL, sql } from "drizzle-orm";
import { type Config, ConfigToken } from "../config/config";
import { type Database, DatabaseToken } from "../database/database.module";
import {
  type FileContent,
  type FileRow,
  type FileUploadRow,
  file,
  fileUpload,
} from "../database/schema";
import { resolveContentType } from "./file.content-type";
import { FileErrors } from "./file.errors";
import { type FilePipelineStep, FilePipelineStepsToken } from "./file.pipeline";
import { assertPresetAccepts, selectPreset } from "./file.preset";
import { FileIndexService } from "./index/file.index.service";
import {
  type FileStorage,
  FileStorageToken,
  type UploadCoords,
  type UploadStrategy,
  type UploadTarget,
} from "./storage/file.storage";
import { storageKeyFor } from "./storage/file.storage.key";

/**
 * The outer column is qualified as `"file".id` rather than interpolated:
 * drizzle renders a column without its table inside a select-list template, and
 * a bare `"id"` binds to the subquery's alias, making the answer always false.
 */
const HAS_CHILDREN = sql<boolean>`EXISTS (SELECT 1 FROM ${file} AS child WHERE child.parent_id = ${file}.id)`;

/** How many expired sessions one sweeper pass cleans up. */
const SWEEP_BATCH_SIZE = 50;

/** How long a session whose cancel failed waits before the sweeper retries it. */
const RETRY_SWEEP_MS = 60 * 60 * 1000;

/**
 * The tree and the upload orchestration; bytes never pass through here. Project
 * lists hydrate the org library, writes are scope-strict, and a bucket key is
 * derived from `(orgId, projectId, id)`.
 *
 * An upload is two-phase: create returns a capability, the client sends the
 * bytes to the bucket, and complete verifies the object before the row turns
 * `ready`. The capability lives in `file_upload`, so an interrupted upload
 * resumes from a later request and an abandoned one is swept.
 */
@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    @Inject(DatabaseToken) private readonly db: Database,
    @Inject(FileStorageToken) private readonly storage: FileStorage,
    @Inject(ConfigToken) private readonly config: Config,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(FilePipelineStepsToken)
    private readonly steps: readonly FilePipelineStep[],
    @Inject(FileIndexService) private readonly index: FileIndexService
  ) {}

  /**
   * Recorded through the caller's transaction, so it commits with the write it
   * describes. `folder` and `file` are separate resources, because a delete or
   * a move means different things to each. An unauthenticated path records
   * nothing rather than a null actor on a person's verb.
   */
  private async recordFileEvent(
    tx: AuditWriteExecutor,
    row: Pick<
      FileRow,
      "id" | "name" | "type" | "orgId" | "projectId" | "groupId"
    >,
    verb:
      | "created"
      | "uploaded"
      | "downloaded"
      | "updated"
      | "moved"
      | "deleted",
    actor: { id: string | null; type: string },
    payload?: AuditPayload
  ): Promise<void> {
    const where = {
      resourceId: row.id,
      label: row.name,
      orgId: row.orgId,
      projectId: row.projectId,
      groupId: row.groupId,
      actorId: actor.id,
      actorType: actor.type,
      ...(payload ? { payload } : {}),
    };
    // Each branch narrows `verb` to what its resource declares rather than
    // casting past the union: a folder has no bytes, and a file's arrival is
    // the upload that finished.
    if (verb === "uploaded" || verb === "downloaded") {
      if (row.type === "folder") {
        return;
      }
      await this.audit.record(tx, { resource: "file", verb, ...where });
      return;
    }
    if (verb === "created") {
      if (row.type !== "folder") {
        return;
      }
      await this.audit.record(tx, { resource: "folder", verb, ...where });
      return;
    }
    await this.audit.record(tx, {
      resource: row.type === "folder" ? "folder" : "file",
      verb,
      ...where,
    });
  }

  /** The principal as the audit log names it: a resolved user id, or nothing. */
  private async actorOf(
    principal: ActorPrincipal | null
  ): Promise<{ id: string | null; type: string }> {
    if (!principal) {
      return { id: null, type: "system" };
    }
    return {
      id: await recordedActorId(this.db, principal),
      type: principal.type,
    };
  }

  /**
   * Never throws: the bytes are in the bucket and the row is confirmed, so a
   * pipeline that could not be queued is degraded rather than failed, and
   * saying otherwise makes the client retry an upload that succeeded.
   */
  private async dispatchPipeline(
    presetName: string,
    fileId: string
  ): Promise<void> {
    const preset = this.config.presets.find((p) => p.name === presetName);
    if (!preset || preset.pipeline.length === 0) {
      return;
    }
    for (const name of preset.pipeline) {
      const step = this.steps.find((candidate) => candidate.name === name);
      if (!step) {
        // Config validation refuses this at boot, so reaching it means a step
        // module was unmounted without its presets being updated.
        this.logger.error(
          `Preset "${presetName}" names step "${name}", which this deployment has not registered`
        );
        continue;
      }
      try {
        await step.enqueue(fileId, presetName);
      } catch (err) {
        this.logger.error(
          `Preset "${presetName}" step "${name}" could not be queued for file ${fileId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  /** What this deployment accepts, so a client can reject a file locally. */
  presets(): UploadPresetsResponse {
    return {
      storageAvailable: this.storage.available,
      presets: this.config.presets,
    };
  }

  async list(
    scope: ResolvedScope,
    query: ProjectFileListInput,
    readable: readonly string[]
  ): Promise<FileListResponse> {
    const page = resolvePageQuery(fileList.pagination, query);
    const conditions: SQL[] = [
      scopeWhereVisible(file, scope, query.scope),
      groupWhereReadable(file.groupId, readable),
      // Internal assets are excluded from the browse tree unless asked for.
      eq(file.system, query.system ?? false),
      // One level at a time: a folder's children, or the scope root. A search
      // asks a different question, so it drops the level entirely.
      ...levelWhere(query),
      ...filterConditions(fileList.filters, query as Record<string, unknown>),
    ];

    if (page.mode === "offset") {
      const sort = sortExpressions(
        fileList.filters,
        query as Record<string, unknown>
      );
      const orderBy = sort.length > 0 ? sort : [desc(file.createdAt)];
      const listed = await fetchOffsetPage(
        page,
        (limit, offset) =>
          this.db
            .select({
              row: file,
              hasChildren: HAS_CHILDREN,
              total: totalOver(),
            })
            .from(file)
            .where(and(...conditions))
            .orderBy(...orderBy, desc(file.id))
            .limit(limit)
            .offset(offset),
        (r) => toFileResponse(r.row, r.hasChildren),
        (r) => r.total
      );
      return query.recursive
        ? { ...listed, items: await this.withPaths(listed.items, readable) }
        : listed;
    }

    const keyset = {
      timestamp: file.createdAt,
      id: file.id,
      direction: "desc" as const,
    };
    const listed = await fetchCursorPage(
      page,
      (limit) =>
        this.db
          .select({ row: file, hasChildren: HAS_CHILDREN })
          .from(file)
          .where(and(...conditions, keysetWhere(keyset, page.cursor)))
          .orderBy(...keysetOrder(keyset))
          .limit(limit),
      (r) => toFileResponse(r.row, r.hasChildren),
      (r) => [r.row.createdAt, r.row.id]
    );
    return query.recursive
      ? { ...listed, items: await this.withPaths(listed.items, readable) }
      : listed;
  }

  /**
   * The ancestor folders from the scope root down, for a listing that is not one
   * level. One query for the page, and only the ancestors the caller may read:
   * an unreadable one shortens the path rather than being named.
   */
  private async withPaths(
    items: FileResponse[],
    readable: readonly string[]
  ): Promise<FileResponse[]> {
    if (items.length === 0 || readable.length === 0) {
      return items;
    }
    const leaves = sql.join(
      items.map((item) => sql`${item.id}`),
      sql`, `
    );
    const groups = sql.join(
      readable.map((group) => sql`${group}`),
      sql`, `
    );
    const ancestors = await this.db.execute<{
      leaf_id: string;
      id: string;
      name: string;
    }>(sql`
      WITH RECURSIVE up AS (
        SELECT f.id AS leaf_id, f.parent_id AS ancestor_id, 1 AS depth
        FROM ${file} f WHERE f.id IN (${leaves})
        UNION ALL
        SELECT u.leaf_id, a.parent_id, u.depth + 1
        FROM up u INNER JOIN ${file} a ON a.id = u.ancestor_id
      )
      SELECT u.leaf_id, a.id, a.name
      FROM up u INNER JOIN ${file} a ON a.id = u.ancestor_id
      WHERE a.group_id IN (${groups})
      ORDER BY u.leaf_id, u.depth DESC
    `);
    const byLeaf = new Map<string, { id: string; name: string }[]>();
    for (const row of ancestors.rows) {
      const path = byLeaf.get(row.leaf_id) ?? [];
      path.push({ id: row.id, name: row.name });
      byLeaf.set(row.leaf_id, path);
    }
    return items.map((item) => ({ ...item, path: byLeaf.get(item.id) ?? [] }));
  }

  async findById(scope: ResolvedScope, fileId: string): Promise<FileResponse> {
    const rows = await this.db
      .select({ row: file, hasChildren: HAS_CHILDREN })
      .from(file)
      .where(and(eq(file.id, fileId), scopeWhereVisible(file, scope)))
      .limit(1);
    const found = rows[0];
    if (!found) {
      throw new PlatformError(FileErrors.NOT_FOUND);
    }
    return toFileResponse(found.row, found.hasChildren);
  }

  async create(
    scope: ResolvedScope,
    dto: CreateFileInput,
    principal: ActorPrincipal | null
  ): Promise<CreateFileResponse> {
    const createdBy = principal
      ? await recordedActorId(this.db, principal)
      : null;
    if (dto.parentId != null) {
      await this.assertParentFolder(scope, dto.parentId);
    }

    // A caller-supplied id makes this idempotent: the same one twice is a retry
    // of the first call, not a second entry.
    if (dto.externalId !== undefined) {
      const existing = await this.findByExternalId(scope, dto.externalId);
      if (existing) {
        const replayed = await this.replayCreate(scope, existing, dto.type);
        if (replayed) {
          return replayed;
        }
      }
    }

    if (dto.type === "folder") {
      const actor = await this.actorOf(principal);
      const row = await this.insert(
        scope,
        {
          id: randomUUID(),
          parentId: dto.parentId ?? null,
          type: "folder",
          name: dto.name,
          externalId: dto.externalId ?? null,
          status: "ready",
          system: dto.system ?? false,
          content: null,
          metadata: dto.metadata ?? {},
          createdBy,
        },
        (tx, row) =>
          this.recordFileEvent(tx, row, "created", actor, {
            after: { name: row.name, parentId: row.parentId },
          })
      );
      return { file: toFileResponse(row, false) };
    }

    if (dto.contentType === undefined || dto.size === undefined) {
      throw new PlatformError(ValidationErrors.FAILED);
    }
    // Named before it is checked: a browser that cannot identify an .ifc sends
    // the generic type, and refusing that makes a quirk into a policy.
    const contentType = resolveContentType(dto.contentType, dto.name);
    // Named wins; otherwise the type decides. The chosen name travels on the
    // session row, so completion dispatches whatever it asked for.
    const presetName =
      dto.preset ?? selectPreset(this.config.presets, contentType);
    assertPresetAccepts(this.config.presets, contentType, dto.size, presetName);
    if (!this.storage.available) {
      throw new PlatformError(FileErrors.STORAGE_UNAVAILABLE);
    }

    const id = randomUUID();
    const content: FileContent = {
      contentType,
      size: dto.size,
      checksum: dto.checksum ?? null,
    };
    const row = await this.insert(
      scope,
      {
        id,
        parentId: dto.parentId ?? null,
        type: "file",
        name: dto.name,
        externalId: dto.externalId ?? null,
        status: "pending",
        system: dto.system ?? false,
        content,
        metadata: dto.metadata ?? {},
        createdBy,
      }
      // No event here. This row is `pending` and may never be finished; the
      // arrival worth recording is the upload that completes it.
    );

    const { coords, target } = await this.storage.createUpload({
      key: storageKeyFor(scope.orgId, scope.projectId, id),
      contentType,
      sizeBytes: dto.size,
    });
    try {
      await this.db.insert(fileUpload).values({
        fileId: id,
        expectedSize: dto.size,
        preset: presetName,
        strategy: coords.strategy,
        sessionUrl: coords.sessionUrl,
        multipartUploadId: coords.multipartUploadId,
        partSizeBytes: coords.partSizeBytes,
        expiresAt: target.expiresAt,
      });
    } catch (err) {
      // The session outlives a failed insert and would hold bytes nobody can
      // finish.
      await this.storage
        .cancelUpload(storageKeyFor(scope.orgId, scope.projectId, id), coords)
        .catch(() => {
          // Best effort: the sweeper cannot see a row nothing wrote.
        });
      throw err;
    }

    return {
      file: toFileResponse(row, false),
      upload: toUploadTicket(target),
    };
  }

  /**
   * What a client needs to carry on after a pause or a reload: a `put` is
   * re-signed, and a resumable session is handed back so the client can probe
   * the committed offset at the bucket.
   */
  async resumeUpload(
    scope: ResolvedScope,
    fileId: string
  ): Promise<UploadSessionResponse> {
    const row = await this.loadStrict(scope, fileId);
    if (row.type !== "file") {
      throw new PlatformError(FileErrors.NOT_A_FILE);
    }
    if (row.status !== "pending") {
      throw new PlatformError(FileErrors.NOT_PENDING);
    }
    const session = await this.loadSession(fileId);
    if (session.expiresAt < new Date()) {
      throw new PlatformError(FileErrors.UPLOAD_EXPIRED);
    }

    const target = await this.storage.refreshUpload(
      {
        key: storageKeyFor(row.orgId, row.projectId, row.id),
        contentType: row.content?.contentType ?? "application/octet-stream",
        // The declaration, not the content bag: this is what the part numbering
        // and the byte bound are computed from.
        sizeBytes: session.expectedSize,
      },
      coordsOf(session)
    );
    // A re-signed PUT has its own, later deadline than the row was written with.
    await this.db
      .update(fileUpload)
      .set({ expiresAt: target.expiresAt, updatedAt: new Date() })
      .where(eq(fileUpload.fileId, fileId));

    return {
      file: toFileResponse(row, false),
      upload: toUploadTicket(target),
    };
  }

  /**
   * Guarded by `create` rather than `delete`: this is the caller taking back its
   * own unfinished upload.
   */
  async abortUpload(scope: ResolvedScope, fileId: string): Promise<void> {
    const row = await this.loadStrict(scope, fileId);
    if (row.type !== "file") {
      throw new PlatformError(FileErrors.NOT_A_FILE);
    }
    if (row.status !== "pending") {
      throw new PlatformError(FileErrors.NOT_PENDING);
    }
    const sessions = await this.db
      .select()
      .from(fileUpload)
      .where(eq(fileUpload.fileId, fileId))
      .limit(1);
    // The cascade takes the session row with it.
    await this.db.delete(file).where(eq(file.id, fileId));
    const session = sessions[0];
    if (session) {
      await this.storage
        .cancelUpload(
          storageKeyFor(row.orgId, row.projectId, row.id),
          coordsOf(session)
        )
        .catch(() => {
          // The row is gone either way; a stray object is the sweeper's.
        });
    }
  }

  /**
   * Idempotent and batched. Instances may overlap harmlessly, because each step
   * is keyed on a row only one of them deletes.
   */
  async sweepExpiredUploads(now = new Date()): Promise<number> {
    const stale = await this.db
      .select({
        session: fileUpload,
        orgId: file.orgId,
        projectId: file.projectId,
      })
      .from(fileUpload)
      .innerJoin(file, eq(file.id, fileUpload.fileId))
      .where(lt(fileUpload.expiresAt, now))
      .orderBy(fileUpload.expiresAt)
      .limit(SWEEP_BATCH_SIZE);

    let swept = 0;
    for (const row of stale) {
      // Cancel before deleting the row: the other order loses the coordinates
      // on a failed cancel, and S3 bills parts a listing cannot show.
      const cancelled = await this.storage
        .cancelUpload(
          storageKeyFor(row.orgId, row.projectId, row.session.fileId),
          coordsOf(row.session)
        )
        .then(() => true)
        .catch(() => false);

      if (!cancelled) {
        // Retried, but with the deadline pushed out, so one permanently failing
        // session cannot monopolise every batch.
        await this.db
          .update(fileUpload)
          .set({ expiresAt: new Date(now.getTime() + RETRY_SWEEP_MS) })
          .where(eq(fileUpload.fileId, row.session.fileId));
        continue;
      }

      const deleted = await this.db
        .delete(file)
        .where(and(eq(file.id, row.session.fileId), eq(file.status, "pending")))
        .returning({ id: file.id });
      swept += deleted.length;
    }
    return swept;
  }

  async update(
    scope: ResolvedScope,
    fileId: string,
    dto: UpdateFileInput,
    principal: ActorPrincipal | null = null
  ): Promise<FileResponse> {
    const row = await this.loadStrict(scope, fileId);

    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.assertParentFolder(scope, dto.parentId);
      if (row.type === "folder") {
        await this.assertNoCycle(fileId, dto.parentId);
      }
    }

    const patch: Partial<typeof file.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) {
      patch.name = dto.name;
    }
    if (dto.parentId !== undefined) {
      patch.parentId = dto.parentId;
    }
    if (dto.groupId !== undefined) {
      // TODO(#152): re-stamp the document's vectors, which still filter on the
      // group they were indexed under.
      patch.groupId = dto.groupId;
    }

    // A folder answers for what is inside it: moving one and leaving its
    // contents behind drops it from a listing while its files stay readable.
    const cascade =
      dto.groupId !== undefined && row.type === "folder"
        ? sql`
            WITH RECURSIVE subtree AS (
              SELECT id FROM ${file} WHERE parent_id = ${row.id}
              UNION ALL
              SELECT f.id FROM ${file} f INNER JOIN subtree s ON s.id = f.parent_id
            )
            UPDATE ${file} SET group_id = ${dto.groupId}, updated_at = now()
            WHERE id IN (SELECT id FROM subtree)
          `
        : null;

    const actor = await this.actorOf(principal);
    // Where it sits and what answers for it are one event; what it is called
    // is another. A reader asking how something became invisible wants the move.
    const isMove = dto.parentId !== undefined || dto.groupId !== undefined;
    const isRename = dto.name !== undefined && dto.name !== row.name;

    const updated = await this.runUnique(async () =>
      this.db.transaction(async (tx) => {
        const rows = await tx
          .update(file)
          .set(patch)
          .where(eq(file.id, fileId))
          .returning();
        if (cascade) {
          await tx.execute(cascade);
        }
        const next = firstRowOrThrow(
          rows,
          () => new PlatformError(FileErrors.NOT_FOUND)
        );
        if (isMove) {
          await this.recordFileEvent(tx, next, "moved", actor, {
            before: { parentId: row.parentId, groupId: row.groupId },
            after: { parentId: next.parentId, groupId: next.groupId },
          });
        }
        if (isRename) {
          await this.recordFileEvent(tx, next, "updated", actor, {
            before: { name: row.name },
            after: { name: next.name },
          });
        }
        return next;
      })
    );
    return toFileResponse(updated, await hasChildrenOf(this.db, updated));
  }

  async delete(
    scope: ResolvedScope,
    fileId: string,
    principal: ActorPrincipal | null = null
  ): Promise<void> {
    const row = await this.loadStrict(scope, fileId);

    // Collected before the cascade so the objects can be purged. A file still
    // uploading needs its session cancelled, not just deleted, or the bucket
    // keeps accepting bytes into an object no row points at.
    const subtree = await this.db.execute<{
      id: string;
      org_id: string;
      project_id: string | null;
      session_url: string | null;
      multipart_upload_id: string | null;
      part_size_bytes: number | null;
      strategy: string | null;
    }>(sql`
      WITH RECURSIVE subtree AS (
        SELECT id, org_id, project_id, type, parent_id FROM ${file} WHERE id = ${row.id}
        UNION ALL
        SELECT f.id, f.org_id, f.project_id, f.type, f.parent_id
        FROM ${file} f INNER JOIN subtree s ON s.id = f.parent_id
      )
      SELECT s.id, s.org_id, s.project_id, u.session_url,
             u.multipart_upload_id, u.part_size_bytes, u.strategy
      FROM subtree s LEFT JOIN ${fileUpload} u ON u.file_id = s.id
      WHERE s.type = 'file'
    `);

    // Vectors outlive the rows describing them, so the intent is written while
    // the org is still readable. An unneeded tombstone clears on the worker's
    // first pass; the opposite mistake leaves a deleted document searchable.
    await this.index.tombstone(
      subtree.rows.map((f) => ({
        fileId: f.id,
        orgId: f.org_id,
        projectId: f.project_id,
      }))
    );

    const actor = await this.actorOf(principal);
    await this.db.transaction(async (tx) => {
      await tx.delete(file).where(eq(file.id, row.id));
      // Recorded with the row, not after the objects: an event that exists only
      // when the bucket cooperated is a log that loses deletions.
      await this.recordFileEvent(tx, row, "deleted", actor, {
        before: { name: row.name, parentId: row.parentId },
      });
    });

    await Promise.allSettled(
      subtree.rows.map((f) => {
        const key = storageKeyFor(f.org_id, f.project_id, f.id);
        return f.strategy === null
          ? this.storage.remove(key)
          : this.storage.cancelUpload(key, {
              strategy: toStrategy(f.strategy),
              sessionUrl: f.session_url,
              multipartUploadId: f.multipart_upload_id,
              partSizeBytes: f.part_size_bytes,
            });
      })
    );
  }

  async complete(
    scope: ResolvedScope,
    fileId: string,
    dto: CompleteFileInput,
    principal: ActorPrincipal | null = null
  ): Promise<FileResponse> {
    const row = await this.loadStrict(scope, fileId);
    if (row.type !== "file") {
      throw new PlatformError(FileErrors.NOT_A_FILE);
    }
    if (row.status !== "pending") {
      throw new PlatformError(FileErrors.NOT_PENDING);
    }

    // Whoever flips the session to `completing` owns the verification, so two
    // completes cannot both confirm one upload. Every failure below releases
    // the claim, leaving it retryable.
    const claimed = await this.db
      .update(fileUpload)
      .set({ status: "completing", updatedAt: new Date() })
      .where(
        and(eq(fileUpload.fileId, fileId), eq(fileUpload.status, "pending"))
      )
      .returning();
    const session = claimed[0];
    if (!session) {
      // No session at all, or another call is mid-verification.
      throw new PlatformError(FileErrors.UPLOAD_SESSION_NOT_FOUND);
    }

    const key = storageKeyFor(scope.orgId, scope.projectId, row.id);
    try {
      // Multipart has to be assembled from its parts before there is an object
      // to verify; the other shapes are already one.
      const object = await this.storage.finalizeUpload(key, coordsOf(session));
      if (!object.exists) {
        // Called before the last bytes landed: retryable, nothing to undo.
        throw new PlatformError(FileErrors.UPLOAD_NOT_FOUND);
      }
      // Against the number the client committed to at create, which is on the
      // session row, not the content bag this is about to overwrite.
      if (object.size !== null && object.size !== session.expectedSize) {
        // The client stopped short, so what is in the bucket is not the file that
        // was announced.
        await this.storage.remove(key).catch(() => {
          // Whatever the bucket did not drop is the sweeper's.
        });
        throw new PlatformError(FileErrors.UPLOAD_SIZE_MISMATCH);
      }

      const content: FileContent = {
        contentType: row.content?.contentType ?? "application/octet-stream",
        // Measured beats claimed, and `dto.size` is already verified equal.
        size: object.size ?? session.expectedSize,
        checksum: dto.checksum ?? row.content?.checksum ?? null,
      };
      const actor = await this.actorOf(principal);
      // A preset with work parks the file at `processing` for the pipeline to
      // settle. Set in the transaction that confirms the bytes, so a client
      // never sees a `ready` that is about to move.
      const preset = this.config.presets.find(
        (candidate) => candidate.name === session.preset
      );
      const nextStatus =
        preset && preset.pipeline.length > 0 ? "processing" : "ready";
      const updated = await this.db.transaction(async (tx) => {
        const rows = await tx
          .update(file)
          .set({ status: nextStatus, content, updatedAt: new Date() })
          .where(eq(file.id, fileId))
          .returning();
        const row2 = firstRowOrThrow(
          rows,
          () => new PlatformError(FileErrors.NOT_FOUND)
        );
        await tx.delete(fileUpload).where(eq(fileUpload.fileId, fileId));
        // The bytes landing is the upload; `created` was the row waiting.
        await this.recordFileEvent(tx, row2, "uploaded", actor, {
          after: { name: row2.name, size: content.size },
        });
        return row2;
      });
      await this.dispatchPipeline(session.preset, fileId);
      return toFileResponse(updated, false);
    } catch (err) {
      await this.db
        .update(fileUpload)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(fileUpload.fileId, fileId));
      throw err;
    }
  }

  async download(
    scope: ResolvedScope,
    fileId: string,
    principal: ActorPrincipal | null = null
  ): Promise<DownloadFileResponse> {
    const rows = await this.db
      .select()
      .from(file)
      .where(and(eq(file.id, fileId), scopeWhereVisible(file, scope)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(FileErrors.NOT_FOUND);
    }
    if (row.type !== "file") {
      throw new PlatformError(FileErrors.NOT_A_FILE);
    }
    // `processing` is readable: the bytes were verified before the pipeline
    // started, and a document being indexed is still a document.
    if (row.status === "pending") {
      throw new PlatformError(FileErrors.NOT_READY);
    }

    const target = await this.storage.createDownloadTarget(
      storageKeyFor(row.orgId, row.projectId, row.id),
      row.name
    );
    // No write to join: the url is the event, and the transfer that follows is
    // between the caller and the bucket.
    await this.recordFileEvent(
      this.db,
      row,
      "downloaded",
      await this.actorOf(principal),
      { after: { name: row.name, expiresAt: target.expiresAt.toISOString() } }
    );
    return { url: target.url, expiresAt: target.expiresAt.toISOString() };
  }

  /** Scope-strict, like every other write-path lookup. */
  private async findByExternalId(
    scope: ResolvedScope,
    externalId: string
  ): Promise<FileRow | undefined> {
    const rows = await this.db
      .select()
      .from(file)
      .where(
        and(eq(file.externalId, externalId), scopeWhereStrict(file, scope))
      )
      .limit(1);
    return rows[0];
  }

  /**
   * What a repeat create with a known `externalId` should answer. Returns null
   * when the earlier attempt is not usable, so the caller creates afresh.
   */
  private async replayCreate(
    scope: ResolvedScope,
    existing: FileRow,
    requestedType: string
  ): Promise<CreateFileResponse | null> {
    if (existing.type !== requestedType) {
      throw new PlatformError(FileErrors.EXTERNAL_ID_CONFLICT);
    }
    if (existing.status !== "pending") {
      return { file: await this.findById(scope, existing.id) };
    }

    const sessions = await this.db
      .select()
      .from(fileUpload)
      .where(eq(fileUpload.fileId, existing.id))
      .limit(1);
    const session = sessions[0];
    if (!session || session.expiresAt < new Date()) {
      // The earlier attempt is dead. Clear it rather than handing back a
      // session nothing can finish, and let the retry start clean.
      await this.abortUpload(scope, existing.id);
      return null;
    }
    const resumed = await this.resumeUpload(scope, existing.id);
    return { file: resumed.file, upload: resumed.upload };
  }

  private async loadSession(fileId: string): Promise<FileUploadRow> {
    const rows = await this.db
      .select()
      .from(fileUpload)
      .where(eq(fileUpload.fileId, fileId))
      .limit(1);
    const session = rows[0];
    if (!session) {
      throw new PlatformError(FileErrors.UPLOAD_SESSION_NOT_FOUND);
    }
    return session;
  }

  /** Walks up from `newParentId`; hitting `folderId` would close a cycle. 64-hop bound. */
  private async assertNoCycle(
    folderId: string,
    newParentId: string
  ): Promise<void> {
    let cursor: string | null = newParentId;
    for (let i = 0; i < 64 && cursor != null; i++) {
      if (cursor === folderId) {
        throw new PlatformError(FileErrors.PARENT_CYCLE);
      }
      const rows: { parentId: string | null }[] = await this.db
        .select({ parentId: file.parentId })
        .from(file)
        .where(eq(file.id, cursor))
        .limit(1);
      cursor = rows[0]?.parentId ?? null;
    }
  }

  /**
   * A parent is a folder visible from the target scope: the same org for an
   * org-scoped row, the project or its org library for a project-scoped one.
   */
  private async assertParentFolder(
    scope: ResolvedScope,
    parentId: string
  ): Promise<void> {
    const rows = await this.db
      .select({
        orgId: file.orgId,
        projectId: file.projectId,
        type: file.type,
      })
      .from(file)
      .where(eq(file.id, parentId))
      .limit(1);
    const parent = rows[0];
    if (!parent) {
      throw new PlatformError(FileErrors.PARENT_NOT_FOUND);
    }
    if (parent.type !== "folder") {
      throw new PlatformError(FileErrors.PARENT_NOT_FOLDER);
    }

    if (scope.projectId == null) {
      if (parent.orgId !== scope.orgId || parent.projectId != null) {
        throw new PlatformError(FileErrors.PARENT_CROSS_SCOPE);
      }
      return;
    }
    const sameProject = parent.projectId === scope.projectId;
    const orgShared = parent.orgId === scope.orgId && parent.projectId == null;
    if (!(sameProject || orgShared)) {
      throw new PlatformError(FileErrors.PARENT_CROSS_SCOPE);
    }
  }

  private async insert(
    scope: ResolvedScope,
    values: {
      id: string;
      parentId: string | null;
      type: string;
      name: string;
      externalId: string | null;
      status: string;
      system: boolean;
      content: FileContent | null;
      metadata: Record<string, unknown>;
      createdBy: string | null;
    },
    /** Runs in the row's own transaction, for the audit event that describes it. */
    alongside?: (tx: AuditWriteExecutor, row: FileRow) => Promise<void>
  ): Promise<FileRow> {
    return this.runUnique(async () =>
      this.db.transaction(async (tx) => {
        const rows = await tx
          .insert(file)
          .values({
            ...values,
            orgId: scope.orgId,
            projectId: scope.projectId,
            groupId: scope.groupId,
          })
          .returning();
        const row = firstRowOrThrow(
          rows,
          () => new PlatformError(FileErrors.NOT_FOUND)
        );
        await alongside?.(tx, row);
        return row;
      })
    );
  }

  private async loadStrict(
    scope: ResolvedScope,
    fileId: string
  ): Promise<FileRow> {
    const rows = await this.db
      .select()
      .from(file)
      .where(and(eq(file.id, fileId), scopeWhereStrict(file, scope)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new PlatformError(FileErrors.NOT_FOUND);
    }
    return row;
  }

  /** Translate the unique-name index violation into a clean 409. */
  private async runUnique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new PlatformError(FileErrors.NAME_CONFLICT);
      }
      throw err;
    }
  }
}

/** Bucket object path: `{orgId}/{projectId|'org'}/{fileId}`. Derived, never stored. */

function coordsOf(session: FileUploadRow): UploadCoords {
  return {
    strategy: toStrategy(session.strategy),
    sessionUrl: session.sessionUrl,
    multipartUploadId: session.multipartUploadId,
    partSizeBytes: session.partSizeBytes,
  };
}

/** The column is text; anything unrecognized is treated as the plain path. */
function toStrategy(value: string): UploadStrategy {
  if (value === "resumable" || value === "multipart") {
    return value;
  }
  return "put";
}

/** Storage target to wire ticket; the shapes are the same union either side. */
function toUploadTicket(target: UploadTarget): UploadTicket {
  if (target.type === "resumable") {
    return {
      type: "resumable",
      sessionUrl: target.sessionUrl,
      chunkSizeBytes: target.chunkSizeBytes,
      expiresAt: target.expiresAt.toISOString(),
    };
  }
  if (target.type === "multipart") {
    return {
      type: "multipart",
      partSizeBytes: target.partSizeBytes,
      parts: target.parts,
      expiresAt: target.expiresAt.toISOString(),
    };
  }
  return {
    type: "put",
    url: target.url,
    method: target.method,
    headers: target.headers,
    expiresAt: target.expiresAt.toISOString(),
  };
}

/** A browse listing is one level; a search is every level, so `parentId` is moot. */
function levelWhere(query: ProjectFileListInput): SQL[] {
  if (query.recursive) {
    return [];
  }
  return [
    query.parentId === undefined
      ? isNull(file.parentId)
      : eq(file.parentId, query.parentId),
  ];
}

/** Only a folder costs the lookup; the list reads it from `HAS_CHILDREN`. */
export async function hasChildrenOf(
  db: Database,
  row: Pick<FileRow, "id" | "type">
): Promise<boolean> {
  if (row.type !== "folder") {
    return false;
  }
  const rows = await db
    .select({ hasChildren: HAS_CHILDREN })
    .from(file)
    .where(eq(file.id, row.id))
    .limit(1);
  return rows[0]?.hasChildren ?? false;
}

export function toFileResponse(
  row: FileRow,
  hasChildren: boolean
): FileResponse {
  const content = row.content
    ? {
        contentType: row.content.contentType,
        size: row.content.size,
        checksum: row.content.checksum,
      }
    : null;
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    parentId: row.parentId,
    type: row.type as FileResponse["type"],
    name: row.name,
    externalId: row.externalId,
    status: row.status as FileResponse["status"],
    system: row.system,
    content,
    metadata: row.metadata,
    hasChildren,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

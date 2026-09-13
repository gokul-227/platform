import { randomUUID } from "node:crypto";
import { AuditWriter } from "@aec-craft/platform-audit-api";
import type { ResolvedScope } from "@aec-craft/platform-contracts";
import {
  type Config,
  type ConfigInput,
  type FileStorage,
  file,
  fileUpload,
  parseConfig,
  type UploadCoords,
  type UploadTarget,
} from "@aec-craft/platform-files-api";
import {
  createFileIndexDeps,
  FileIndexPipelineStep,
  FileIndexService,
  FilePipelineSettler,
  FileService,
} from "@aec-craft/platform-files-api/nest";
import {
  buildServices,
  dbAvailable,
  makeOrg,
  makeProject,
  makeUser,
  projectScope,
  useTestDb,
} from "@aec-craft/platform-testing";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

/**
 * The upload session lifecycle against real Postgres, with storage stubbed: the
 * parts that can only be got wrong in the database — the completion claim, what
 * a failure leaves behind, and the sweeper — rather than the bucket protocol
 * (that is the SDK engine's suite).
 */

/** Storage that records what it was asked to do and can be told to lie. */
function stubStorage(options?: {
  size?: number | null;
  exists?: boolean;
  failCancel?: boolean;
  resumableAbove?: number;
}) {
  const calls = {
    cancelled: [] as { coords: UploadCoords; key: string }[],
    created: [] as string[],
    refreshed: [] as string[],
    removed: [] as string[],
  };
  const resumableAbove = options?.resumableAbove ?? 8 * 1024 * 1024;
  const storage: FileStorage = {
    available: true,
    createUpload(args) {
      calls.created.push(args.key);
      const target: UploadTarget =
        args.sizeBytes > resumableAbove
          ? {
              type: "resumable",
              sessionUrl: `https://bucket.test/session/${args.key}`,
              chunkSizeBytes: 256 * 1024,
              expiresAt: new Date(Date.now() + 3_600_000),
            }
          : {
              type: "put",
              url: `https://bucket.test/put/${args.key}`,
              method: "PUT",
              headers: {},
              expiresAt: new Date(Date.now() + 3_600_000),
            };
      return Promise.resolve({
        target,
        coords: {
          strategy: target.type,
          sessionUrl: target.type === "resumable" ? target.sessionUrl : null,
          multipartUploadId: null,
          partSizeBytes: null,
        },
      });
    },
    refreshUpload(args, coords) {
      calls.refreshed.push(args.key);
      if (coords.strategy === "resumable" && coords.sessionUrl) {
        return Promise.resolve({
          type: "resumable",
          sessionUrl: coords.sessionUrl,
          chunkSizeBytes: 256 * 1024,
          expiresAt: new Date(Date.now() + 3_600_000),
        });
      }
      return Promise.resolve({
        type: "put",
        url: `https://bucket.test/put/${args.key}?resigned`,
        method: "PUT",
        headers: {},
        expiresAt: new Date(Date.now() + 3_600_000),
      });
    },
    createDownloadTarget: (key) =>
      Promise.resolve({
        url: `https://bucket.test/read/${key}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      }),
    head: () =>
      Promise.resolve({
        exists: options?.exists ?? true,
        size: options?.size === undefined ? 12 : options.size,
        checksum: null,
      }),
    // The stub has nothing to assemble, so finalizing is the same head.
    finalizeUpload: () =>
      Promise.resolve({
        exists: options?.exists ?? true,
        size: options?.size === undefined ? 12 : options.size,
        checksum: null,
      }),
    cancelUpload: (key, coords) => {
      calls.cancelled.push({ key, coords });
      return options?.failCancel
        ? Promise.reject(new Error("bucket unreachable"))
        : Promise.resolve();
    },
    remove: (key) => {
      calls.removed.push(key);
      return Promise.resolve();
    },
  };
  return { calls, storage };
}

function config(overrides?: Partial<ConfigInput>): Config {
  return parseConfig({
    databaseUrl: "postgres://localhost:5433/files",
    fileStorage: { provider: "gcs", bucket: "test-bucket" },
    ...overrides,
  });
}

describe.skipIf(!dbAvailable())("File upload sessions (integration)", () => {
  const ctx = useTestDb();

  /**
   * A real org and project behind the scope: deployments that migrated the file
   * table before the FKs were dropped still enforce them, so synthetic ids would
   * pass here and fail there.
   */
  async function scopeFor(): Promise<ResolvedScope> {
    const services = buildServices(
      ctx.db,
      ctx.tenancyDb,
      ctx.usersDb,
      ctx.authorizationDb
    );
    const owner = await makeUser(ctx.db, services);
    const org = await makeOrg(services, owner.principal);
    const project = await makeProject(services, org.id, owner.principal);
    return await projectScope(services, project.id);
  }

  /** The service as the module wires it. `AuditWriter` has no dependencies of
   *  its own, so a test builds the real one rather than a stand-in. */
  function serviceWith(
    storage: FileStorage,
    cfg: Config = config()
  ): FileService {
    // The real index service, with no document index configured: the pipeline
    // dispatch on complete is exercised as a deployment without one runs it.
    const index = new FileIndexService(
      ctx.filesDb,
      storage,
      cfg,
      createFileIndexDeps(cfg, ctx.filesDb),
      new FilePipelineSettler(ctx.filesDb)
    );
    return new FileService(
      ctx.filesDb,
      storage,
      cfg,
      new AuditWriter(),
      [new FileIndexPipelineStep(index, cfg)],
      index
    );
  }

  async function createFile(
    service: FileService,
    target: ResolvedScope,
    size: number
  ) {
    return await service.create(
      target,
      {
        type: "file",
        name: `model-${randomUUID()}.ifc`,
        contentType: "application/x-step",
        size,
      },
      null
    );
  }

  it("hands out a put ticket for a small file and a session for a large one", async () => {
    const { storage } = stubStorage();
    const service = serviceWith(storage);
    const target = await scopeFor();

    const small = await createFile(service, target, 1024);
    const large = await createFile(service, target, 64 * 1024 * 1024);

    expect(small.upload?.type).toBe("put");
    expect(large.upload?.type).toBe("resumable");
    const sessions = await ctx.filesDb.select().from(fileUpload);
    expect(sessions).toHaveLength(2);
    // The session URL is a write capability: it lives on the row, not on the file.
    expect(
      sessions.find((s) => s.strategy === "resumable")?.sessionUrl
    ).toContain("https://bucket.test/session/");
    expect(sessions.find((s) => s.strategy === "put")?.sessionUrl).toBeNull();
  });

  it("completes once, and the second call finds no session to claim", async () => {
    const { storage } = stubStorage({ size: 1024 });
    const service = serviceWith(storage);
    const target = await scopeFor();
    const created = await createFile(service, target, 1024);

    const ready = await service.complete(target, created.file.id, {});
    expect(ready.status).toBe("ready");
    expect(await ctx.filesDb.select().from(fileUpload)).toHaveLength(0);

    await expect(
      service.complete(target, created.file.id, {})
    ).rejects.toMatchObject({ code: "FILE_NOT_PENDING" });
  });

  it("leaves the upload retryable when the object has not landed", async () => {
    const { storage } = stubStorage({ exists: false });
    const service = serviceWith(storage);
    const target = await scopeFor();
    const created = await createFile(service, target, 1024);

    await expect(
      service.complete(target, created.file.id, {})
    ).rejects.toMatchObject({ code: "FILE_UPLOAD_NOT_FOUND" });

    // The claim is released, so the client can call complete again.
    const [session] = await ctx.filesDb.select().from(fileUpload);
    expect(session?.status).toBe("pending");
    const [row] = await ctx.filesDb
      .select()
      .from(file)
      .where(eq(file.id, created.file.id));
    expect(row?.status).toBe("pending");
  });

  it("rejects a size mismatch and drops the bytes", async () => {
    const { calls, storage } = stubStorage({ size: 7 });
    const service = serviceWith(storage);
    const target = await scopeFor();
    const created = await createFile(service, target, 1024);

    await expect(
      service.complete(target, created.file.id, {})
    ).rejects.toMatchObject({ code: "FILE_UPLOAD_SIZE_MISMATCH" });
    expect(calls.removed).toHaveLength(1);
  });

  it("re-issues the session on resume and refuses once it expired", async () => {
    const { calls, storage } = stubStorage();
    const service = serviceWith(storage);
    const target = await scopeFor();
    const created = await createFile(service, target, 64 * 1024 * 1024);

    const session = await service.resumeUpload(target, created.file.id);
    expect(session.upload).toMatchObject({ type: "resumable" });
    expect(calls.refreshed).toHaveLength(1);

    await ctx.filesDb
      .update(fileUpload)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(fileUpload.fileId, created.file.id));
    await expect(
      service.resumeUpload(target, created.file.id)
    ).rejects.toMatchObject({ code: "FILE_UPLOAD_EXPIRED" });
  });

  it("abort cancels the session and removes the pending row", async () => {
    const { calls, storage } = stubStorage();
    const service = serviceWith(storage);
    const target = await scopeFor();
    const created = await createFile(service, target, 64 * 1024 * 1024);

    await service.abortUpload(target, created.file.id);

    expect(calls.cancelled).toHaveLength(1);
    expect(calls.cancelled[0]?.coords.strategy).toBe("resumable");
    expect(await ctx.filesDb.select().from(file)).toHaveLength(0);
    expect(await ctx.filesDb.select().from(fileUpload)).toHaveLength(0);
  });

  it("sweeps expired sessions and spares one that completed in the meantime", async () => {
    const { calls, storage } = stubStorage({ size: 1024 });
    const service = serviceWith(storage);
    const target = await scopeFor();
    const abandoned = await createFile(service, target, 64 * 1024 * 1024);
    const finished = await createFile(service, target, 1024);

    const past = new Date(Date.now() - 60_000);
    await ctx.filesDb.update(fileUpload).set({ expiresAt: past });
    await service.complete(target, finished.file.id, {});

    const swept = await service.sweepExpiredUploads();

    expect(swept).toBe(1);
    expect(calls.cancelled.map((c) => c.key)).toHaveLength(1);
    const remaining = await ctx.filesDb.select().from(file);
    expect(remaining.map((r) => r.id)).toEqual([finished.file.id]);
    expect(
      await ctx.filesDb
        .select()
        .from(fileUpload)
        .where(eq(fileUpload.fileId, abandoned.file.id))
    ).toHaveLength(0);
  });

  it("keeps a session whose cancel failed, with the deadline pushed out", async () => {
    // Deleting the row first would lose the coordinates, and on S3 that leaks
    // parts that are billed while invisible to a listing. So a failed cancel
    // keeps the row for a later pass, just not immediately.
    const { calls, storage } = stubStorage({ failCancel: true });
    const service = serviceWith(storage);
    const target = await scopeFor();
    const created = await createFile(service, target, 64 * 1024 * 1024);
    await ctx.filesDb
      .update(fileUpload)
      .set({ expiresAt: new Date(Date.now() - 60_000) });

    const swept = await service.sweepExpiredUploads();

    expect(swept).toBe(0);
    expect(calls.cancelled).toHaveLength(1);
    // The row survives, so the bytes can still be reclaimed.
    const [row] = await ctx.filesDb
      .select()
      .from(file)
      .where(eq(file.id, created.file.id));
    expect(row?.status).toBe("pending");
    const [session] = await ctx.filesDb
      .select()
      .from(fileUpload)
      .where(eq(fileUpload.fileId, created.file.id));
    expect(session?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("names the content type from the extension when the browser could not", async () => {
    // A browser leaves File.type empty for an .ifc, so the client declares the
    // generic type. The preset check has to see the resolved one, or a browser
    // quirk becomes a policy decision.
    const { storage } = stubStorage();
    const service = serviceWith(
      storage,
      config({
        presets: [
          {
            name: "default",
            maxFileSizeBytes: 5 * 1024 ** 3,
            acceptedContentTypes: ["application/x-step"],
          },
        ],
      })
    );
    const target = await scopeFor();

    const created = await service.create(
      target,
      {
        type: "file",
        name: "tower.ifc",
        contentType: "application/octet-stream",
        size: 1024,
      },
      null
    );

    expect(created.file.content?.contentType).toBe("application/x-step");
  });

  it("keeps a content type the client did name", async () => {
    const { storage } = stubStorage();
    const service = serviceWith(storage);
    const target = await scopeFor();

    const created = await service.create(
      target,
      {
        type: "file",
        name: "plan.pdf",
        contentType: "application/pdf",
        size: 1024,
      },
      null
    );

    expect(created.file.content?.contentType).toBe("application/pdf");
  });

  it("enforces the preset before anything is created", async () => {
    const { calls, storage } = stubStorage();
    const service = serviceWith(
      storage,
      config({
        presets: [
          {
            name: "default",
            maxFileSizeBytes: 4096,
            acceptedContentTypes: ["image/*"],
          },
        ],
      })
    );
    const target = await scopeFor();

    await expect(
      service.create(
        target,
        {
          type: "file",
          name: "huge.ifc",
          contentType: "image/png",
          size: 8192,
        },
        null
      )
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });

    await expect(
      service.create(
        target,
        {
          type: "file",
          name: "model.ifc",
          contentType: "application/x-step",
          size: 1024,
        },
        null
      )
    ).rejects.toMatchObject({ code: "FILE_CONTENT_TYPE_NOT_ALLOWED" });

    expect(calls.created).toHaveLength(0);
    expect(await ctx.filesDb.select().from(file)).toHaveLength(0);
    expect(service.presets()).toMatchObject({
      storageAvailable: true,
      presets: [
        {
          name: "default",
          maxFileSizeBytes: 4096,
          acceptedContentTypes: ["image/*"],
        },
      ],
    });
  });

  it("holds a create to the preset it names, not to the default", async () => {
    const { storage } = stubStorage();
    const service = serviceWith(
      storage,
      config({
        presets: [
          {
            name: "default",
            maxFileSizeBytes: 5 * 1024 ** 3,
            acceptedContentTypes: null,
          },
          {
            name: "avatar",
            maxFileSizeBytes: 4096,
            acceptedContentTypes: ["image/*"],
          },
        ],
      })
    );
    const target = await scopeFor();
    const avatar = {
      type: "file" as const,
      contentType: "image/png",
      size: 8192,
    };

    await expect(
      service.create(
        target,
        { ...avatar, name: "me.png", preset: "avatar" },
        null
      )
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });

    // Same bytes under the deployment-wide ceiling, which is what makes the
    // rejection above the preset's doing. Named, not omitted: an unnamed create
    // is routed by content type, and `avatar` claims `image/*`.
    const created = await service.create(
      target,
      { ...avatar, name: "me.png", preset: "default" },
      null
    );
    expect(created.file.status).toBe("pending");
  });

  it("rejects a preset the deployment does not offer", async () => {
    const { calls, storage } = stubStorage();
    const service = serviceWith(storage);
    const target = await scopeFor();

    await expect(
      service.create(
        target,
        {
          type: "file",
          name: "plan.pdf",
          contentType: "application/pdf",
          size: 1024,
          preset: "no-such-preset",
        },
        null
      )
    ).rejects.toMatchObject({ code: "FILE_PRESET_NOT_FOUND" });

    expect(calls.created).toHaveLength(0);
    expect(await ctx.filesDb.select().from(file)).toHaveLength(0);
  });
  it("reports hasChildren on a folder that has children", async () => {
    // The hint drives the expand affordance in a tree UI, and its EXISTS
    // predicate is a correlated subquery: an unqualified outer column would
    // bind to the subquery's own alias and answer false for every folder.
    const { storage } = stubStorage();
    const service = serviceWith(storage);
    const target = await scopeFor();
    if (target.projectId == null) {
      throw new Error("scopeFor returns a project scope");
    }

    const folder = await service.create(
      target,
      { type: "folder", name: "models" },
      null
    );
    const empty = await service.create(
      target,
      { type: "folder", name: "empty" },
      null
    );
    await service.create(
      target,
      { type: "folder", name: "nested", parentId: folder.file.id },
      null
    );

    const groups = await ctx.authorizationDb.execute<{ id: string }>(
      sql`select id from "group"`
    );
    const listed = await service.list(
      target,
      { scope: "project" },
      groups.rows.map((row) => row.id)
    );
    const byName = new Map(listed.items.map((i) => [i.name, i.hasChildren]));
    expect(byName.get("models")).toBe(true);
    expect(byName.get("empty")).toBe(false);

    const fetched = await service.findById(target, folder.file.id);
    expect(fetched.hasChildren).toBe(true);
    expect((await service.findById(target, empty.file.id)).hasChildren).toBe(
      false
    );
  });

  it("moving a folder to another group takes its contents with it", async () => {
    // The failure this guards is the one that looks like it worked: the folder
    // drops out of a listing while every file inside it stays readable,
    // because only the folder's own row moved.
    const { storage } = stubStorage();
    const service = serviceWith(storage);
    const target = await scopeFor();

    const folder = await service.create(
      target,
      { type: "folder", name: "tender" },
      null
    );
    const inner = await service.create(
      target,
      { type: "folder", name: "drawings", parentId: folder.file.id },
      null
    );
    const leaf = await service.create(
      target,
      {
        type: "file",
        name: "plan.ifc",
        contentType: "application/octet-stream",
        size: 8,
      },
      null
    );
    await service.update(target, leaf.file.id, { parentId: inner.file.id });

    const restricted = randomUUID();
    await ctx.authorizationDb.execute(
      sql`INSERT INTO "group" (id, org_id, project_id, parent_id, type, name, slug)
          VALUES (${restricted}, ${target.orgId}, ${target.projectId}, ${target.groupId}, 'custom', 'Tender team', ${restricted})`
    );

    await service.update(target, folder.file.id, { groupId: restricted });

    const rows = await ctx.filesDb.execute<{ id: string; group_id: string }>(
      sql`SELECT id, group_id FROM "file"`
    );
    const byId = new Map(rows.rows.map((row) => [row.id, row.group_id]));
    expect({
      folder: byId.get(folder.file.id),
      inner: byId.get(inner.file.id),
      leaf: byId.get(leaf.file.id),
    }).toEqual({ folder: restricted, inner: restricted, leaf: restricted });
  });
});

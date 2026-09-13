import { file } from "@aec-craft/platform-files-api";
import {
  type AuthorizationDatabase,
  AuthorizationDatabaseToken,
  bootstrapTestApp,
  buildServices,
  DatabasePoolToken,
  dbAvailable,
  ensureMigrated,
  type FilesDatabase,
  FilesDatabaseToken,
  type GraphDatabase,
  GraphDatabaseToken,
  ketoAvailable,
  makeOrg,
  makeProject,
  makeUser,
  req,
  resetSeq,
  type TenancyDatabase,
  TenancyDatabaseToken,
  truncateAll,
  type UsersDatabase,
  UsersDatabaseToken,
} from "@aec-craft/platform-testing";
import type { INestApplication } from "@nestjs/common";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The nested file collections and the flat by-id family. Folders only: with no
 * storage backend configured the null driver 503s every byte operation, and the
 * tree is the half that does not need one.
 */
describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "files collections + by-id (e2e)",
  () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      ({ app, baseUrl } = await bootstrapTestApp());
      await ensureMigrated(app.get<pg.Pool>(DatabasePoolToken));
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(async () => {
      await truncateAll(app.get<pg.Pool>(DatabasePoolToken));
      resetSeq();
    });

    const services = () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      return {
        db,
        services: buildServices(
          db,
          app.get<TenancyDatabase>(TenancyDatabaseToken),
          app.get<UsersDatabase>(UsersDatabaseToken),
          app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
        ),
      };
    };

    it("the collection's URL is the partition: org library, project, and the hydration between them", async () => {
      const { db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const org = await makeOrg(svc, owner.principal);
      const project = await makeProject(svc, org.id, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      const libRes = await as.post(`/files?orgId=${org.id}`, {
        type: "folder",
        name: "Standards",
      });
      expect(libRes.status).toBe(201);
      const lib = (libRes.body as { file: { id: string; projectId: null } })
        .file;
      expect(lib.projectId).toBeNull();

      const planRes = await as.post(`/files?projectId=${project.id}`, {
        type: "folder",
        name: "Plans",
      });
      expect(planRes.status).toBe(201);
      const plan = (planRes.body as { file: { id: string; projectId: string } })
        .file;
      expect(plan.projectId).toBe(project.id);

      // The project collection hydrates the library; the org collection is the
      // library alone, never a subtree over the projects beneath it.
      const hydrated = await as.get(`/files?projectId=${project.id}`);
      expect(hydrated.status).toBe(200);
      expect(
        (hydrated.body as { items: { id: string }[] }).items
          .map((f) => f.id)
          .sort()
      ).toEqual([lib.id, plan.id].sort());

      const onlyProject = await as.get(
        `/files?projectId=${project.id}&scope=project`
      );
      expect(
        (onlyProject.body as { items: { id: string }[] }).items.map((f) => f.id)
      ).toEqual([plan.id]);

      const library = await as.get(`/files?orgId=${org.id}`);
      expect(
        (library.body as { items: { id: string }[] }).items.map((f) => f.id)
      ).toEqual([lib.id]);
    });

    it("by-id stays flat and resolves the scope from the row", async () => {
      const { db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const org = await makeOrg(svc, owner.principal);
      const project = await makeProject(svc, org.id, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      const created = await as.post(`/files?projectId=${project.id}`, {
        type: "folder",
        name: "Plans",
      });
      const id = (created.body as { file: { id: string } }).file.id;

      // One route for either scope: the row carries the partition.
      const read = await as.get(`/files/${id}`);
      expect(read.status).toBe(200);
      expect((read.body as { projectId: string }).projectId).toBe(project.id);

      const renamed = await as.patch(`/files/${id}`, { name: "Plans (rev B)" });
      expect(renamed.status).toBe(200);
      expect((renamed.body as { name: string }).name).toBe("Plans (rev B)");

      const removed = await as.delete(`/files/${id}`);
      expect(removed.status).toBe(204);
      expect((await as.get(`/files/${id}`)).status).toBe(404);
    });

    it("`hasChildren` answers for the folder's contents, not for being a folder", async () => {
      const { db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const org = await makeOrg(svc, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      const empty = (
        (
          await as.post(`/files?orgId=${org.id}`, {
            type: "folder",
            name: "Empty",
          })
        ).body as { file: { id: string } }
      ).file.id;
      const parent = (
        (
          await as.post(`/files?orgId=${org.id}`, {
            type: "folder",
            name: "Parent",
          })
        ).body as { file: { id: string } }
      ).file.id;
      await as.post(`/files?orgId=${org.id}`, {
        type: "folder",
        name: "Child",
        parentId: parent,
      });

      // A rename used to answer from the row's own type, so every folder
      // claimed children and a tree UI offered an expander that opened onto
      // nothing.
      const renamedEmpty = await as.patch(`/files/${empty}`, {
        name: "Empty (rev B)",
      });
      expect(renamedEmpty.status).toBe(200);
      expect(renamedEmpty.body).toMatchObject({ hasChildren: false });

      const renamedParent = await as.patch(`/files/${parent}`, {
        name: "Parent (rev B)",
      });
      expect(renamedParent.status).toBe(200);
      expect(renamedParent.body).toMatchObject({ hasChildren: true });

      // The KV route answers the same way.
      const keyed = await as.put(
        `/files/${empty}/metadata/apps.viewer.pinned`,
        {
          value: true,
        }
      );
      expect(keyed.body).toMatchObject({ hasChildren: false });
      const keyedParent = await as.put(
        `/files/${parent}/metadata/apps.viewer.pinned`,
        { value: true }
      );
      expect(keyedParent.body).toMatchObject({ hasChildren: true });
    });

    it("metadata is written one key at a time, and each write is its own audit event", async () => {
      const { db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const org = await makeOrg(svc, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      const created = await as.post(`/files?orgId=${org.id}`, {
        type: "folder",
        name: "Library",
        metadata: { apps: { platform: { purpose: "logo" } } },
      });
      const id = (created.body as { file: { id: string } }).file.id;

      // Nested and non-string values survive the wire as themselves.
      const keyed = await as.put(`/files/${id}/metadata/apps.viewer.camera`, {
        value: { fov: 60, locked: true },
      });
      expect(keyed.status).toBe(200);
      expect(keyed.body).toMatchObject({
        metadata: {
          apps: {
            platform: { purpose: "logo" },
            viewer: { camera: { fov: 60, locked: true } },
          },
        },
      });

      const unkeyed = await as.delete(
        `/files/${id}/metadata/apps.platform.purpose`
      );
      expect(unkeyed.status).toBe(200);
      expect(unkeyed.body).toMatchObject({
        metadata: { apps: { platform: {}, viewer: { camera: { fov: 60 } } } },
      });

      // Deleting a key that was never there changes nothing.
      const again = await as.delete(
        `/files/${id}/metadata/apps.platform.purpose`
      );
      expect(again.status).toBe(200);

      const audited = await as.get(
        `/audit/events?orgId=${org.id}&resource=folder&verb=updated`
      );
      expect(audited.status).toBe(200);
      const keys = (
        audited.body as { items: { payload: { metadataKey?: string } }[] }
      ).items.map((event) => event.payload?.metadataKey);
      expect(keys).toContain("apps.viewer.camera");
      expect(keys).toContain("apps.platform.purpose");
    });

    it("the update body no longer carries the bag", async () => {
      const { db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const org = await makeOrg(svc, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });
      const created = await as.post(`/files?orgId=${org.id}`, {
        type: "folder",
        name: "Plans",
        metadata: { apps: { platform: { purpose: "logo" } } },
      });
      const id = (created.body as { file: { id: string } }).file.id;

      const patched = await as.patch(`/files/${id}`, {
        metadata: { apps: { platform: { purpose: "overwritten" } } },
      });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({
        metadata: { apps: { platform: { purpose: "logo" } } },
      });
    });

    it("a non-member is told the file is not there, never that it exists", async () => {
      const { db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const outsider = await makeUser(db, svc);
      const org = await makeOrg(svc, owner.principal);

      const asOwner = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });
      const created = await asOwner.post(`/files?orgId=${org.id}`, {
        type: "folder",
        name: "Secret",
      });
      const id = (created.body as { file: { id: string } }).file.id;

      const asOutsider = req(baseUrl).user({
        subject: outsider.subject,
        email: outsider.email,
      });
      const peek = await asOutsider.get(`/files/${id}`);
      expect(peek.status).toBe(404);
      expect((peek.body as { error: { code: string } }).error.code).toBe(
        "FILE_NOT_FOUND"
      );

      // The collection masks the same way: the org itself is not visible.
      const list = await asOutsider.get(`/files?orgId=${org.id}`);
      expect(list.status).toBe(404);
    });

    it("a level can order itself folders first, then by name", async () => {
      const { db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const org = await makeOrg(svc, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      for (const name of ["Zoning", "Details"]) {
        const res = await as.post(`/files?orgId=${org.id}`, {
          type: "folder",
          name,
        });
        expect(res.status).toBe(201);
      }

      // A `file` row goes in through the table: creating one over HTTP wants an
      // upload ticket, and the null storage driver 503s every byte operation.
      const filesDb = app.get<FilesDatabase>(FilesDatabaseToken);
      const [folder] = await filesDb.select().from(file).limit(1);
      const content = {
        contentType: "application/octet-stream",
        size: 1,
        checksum: null,
      };
      await filesDb.insert(file).values([
        {
          orgId: org.id,
          groupId: folder!.groupId,
          type: "file",
          name: "a-plan.ifc",
          content,
        },
        {
          orgId: org.id,
          groupId: folder!.groupId,
          type: "file",
          name: "b-spec.pdf",
          content,
        },
      ]);

      // `type` is sortable so a tree can group by it, and the enum orders
      // lexically, so descending puts `folder` ahead of `file`. Offset mode
      // because `?sort` is rejected on a cursor page.
      const res = await as.get(
        `/files?orgId=${org.id}&page=1&pageSize=100&sort=type:desc&sort=name:asc`
      );
      expect(res.status).toBe(200);
      expect(
        (res.body as { items: { name: string }[] }).items.map((f) => f.name)
      ).toEqual(["Details", "Zoning", "a-plan.ifc", "b-spec.pdf"]);

      // The list is closed: only a field the spec declares sortable is accepted,
      // which is what the declaration above buys.
      const refused = await as.get(
        `/files?orgId=${org.id}&page=1&sort=status:asc`
      );
      expect(refused.status).toBe(400);
    });

    /**
     * Folders, because a file's byte operations need a storage backend this
     * suite has none of. The code path is the same one either way; only the
     * resource the event is filed under differs.
     */
    it("records what happened to a row, in the feed that reads it", async () => {
      const { db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const org = await makeOrg(svc, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      const made = async (name: string): Promise<string> => {
        const res = await as.post(`/files?orgId=${org.id}`, {
          type: "folder",
          name,
        });
        expect(res.status).toBe(201);
        return (res.body as { file: { id: string } }).file.id;
      };
      const moved = await made("Drawings");
      const into = await made("Archive");

      expect(
        (await as.patch(`/files/${moved}`, { name: "Plans" })).status
      ).toBe(200);
      expect(
        (await as.patch(`/files/${moved}`, { parentId: into })).status
      ).toBe(200);
      expect((await as.delete(`/files/${moved}`)).status).toBe(204);

      const feed = await as.get(`/audit/events?orgId=${org.id}`);
      expect(feed.status).toBe(200);
      const items = (
        feed.body as {
          items: {
            resource: string;
            resourceId: string | null;
            resourceLabel: string | null;
            verb: string;
          }[];
        }
      ).items;
      expect(items.map((e) => `${e.resource}.${e.verb}`)).toEqual(
        expect.arrayContaining([
          "folder.created",
          "folder.updated",
          "folder.moved",
          "folder.deleted",
        ])
      );

      // Every event names what it was about and points at it, and the delete
      // carries the name the row had when it went: nothing can look it up after.
      expect(items.every((e) => e.resourceLabel !== null)).toBe(true);
      const deleted = items.find((e) => e.verb === "deleted");
      expect(deleted?.resourceLabel).toBe("Plans");
      expect(deleted?.resourceId).toBe(moved);

      // The name is what a reader searches for, so the server filters on it.
      const found = await as.get(
        `/audit/events?orgId=${org.id}&resourceLabel=contains.plan`
      );
      expect(found.status).toBe(200);
      const labels = (
        found.body as { items: { resourceLabel: string | null }[] }
      ).items.map((e) => e.resourceLabel);
      expect(labels.length).toBeGreaterThan(0);
      expect(labels.every((l) => l === "Plans")).toBe(true);
    });

    it("keeps a project's own activity out of the org feed", async () => {
      const { db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const org = await makeOrg(svc, owner.principal);
      const project = await makeProject(svc, org.id, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      expect(
        (
          await as.post(`/files?projectId=${project.id}`, {
            type: "folder",
            name: "Drawings",
          })
        ).status
      ).toBe(201);

      const actions = async (path: string): Promise<string[]> => {
        const res = await as.get(path);
        expect(res.status).toBe(200);
        return (
          res.body as { items: { resource: string; verb: string }[] }
        ).items.map((e) => `${e.resource}.${e.verb}`);
      };

      // The org keeps its projects being created, which is an org-level event,
      // and not what happens inside them.
      const orgFeed = await actions(`/audit/events?orgId=${org.id}`);
      expect(orgFeed).toContain("project.created");
      expect(orgFeed).not.toContain("folder.created");

      const projectFeed = await actions(
        `/audit/events?projectId=${project.id}`
      );
      expect(projectFeed).toContain("folder.created");
    });

    it("finds a name at any depth, and says where it lives", async () => {
      const { db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const org = await makeOrg(svc, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      const folder = async (
        name: string,
        parentId?: string
      ): Promise<string> => {
        const res = await as.post(`/files?orgId=${org.id}`, {
          type: "folder",
          name,
          ...(parentId ? { parentId } : {}),
        });
        expect(res.status).toBe(201);
        return (res.body as { file: { id: string } }).file.id;
      };
      const top = await folder("Drawings");
      const middle = await folder("Level 2", top);
      const deep = await folder("Plan of record", middle);

      interface Hit {
        id: string;
        path?: { id: string; name: string }[];
      }
      const hits = async (query: string): Promise<Hit[]> => {
        const res = await as.get(`/files?orgId=${org.id}&${query}`);
        expect(res.status).toBe(200);
        return (res.body as { items: Hit[] }).items;
      };

      // A level listing sees the root only, which is what makes the search a
      // different request rather than a filter on the same one.
      expect(await hits("name=contains.plan")).toEqual([]);

      const found = await hits("recursive=true&name=contains.plan");
      expect(found.map((h) => h.id)).toEqual([deep]);
      expect(found[0]?.path?.map((p) => p.name)).toEqual([
        "Drawings",
        "Level 2",
      ]);

      // A root-level hit has nowhere to name.
      const shallow = await hits("recursive=true&name=contains.drawings");
      expect(shallow.map((h) => h.id)).toEqual([top]);
      expect(shallow[0]?.path).toEqual([]);
    });

    it("presets stay flat: deployment config, not scoped data", async () => {
      const { db, services: svc } = services();
      const owner = await makeUser(db, svc);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      // Declared before `:fileId`, so the static segment wins the match rather
      // than reading a file whose id is the word "presets".
      const res = await as.get("/files/presets");
      expect(res.status).toBe(200);
      expect(Array.isArray((res.body as { presets: unknown[] }).presets)).toBe(
        true
      );
    });
  }
);

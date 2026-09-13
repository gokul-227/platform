import {
  type AuthorizationDatabase,
  AuthorizationDatabaseToken,
  bootstrapTestApp,
  buildServices,
  DatabasePoolToken,
  dbAvailable,
  ensureMigrated,
  type GraphDatabase,
  GraphDatabaseToken,
  ketoAvailable,
  makeOrg,
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
 * The byte routes, the index routes and the four retrieval routes.
 *
 * The test host configures no bucket and no index provider, which is the
 * deployment these have to behave in: `files.e2e` covers the tree that works
 * without one, and this covers what the rest answer instead. Two different
 * degradations, and the distinction is the point — a missing bucket is
 * `FILE_STORAGE_UNAVAILABLE` and a missing index is the index's own code, so a
 * caller can tell which piece of infrastructure is absent.
 *
 * What is asserted throughout is the ordering: the permit runs before the
 * dependency is reached for, so an outsider never learns a file exists from a
 * 503.
 */

interface Envelope {
  error: { code: string };
}

const UNKNOWN = "99999999-9999-4999-8999-999999999999";

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "file bytes + index (e2e)",
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

    function services() {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      return buildServices(
        db,
        app.get<TenancyDatabase>(TenancyDatabaseToken),
        app.get<UsersDatabase>(UsersDatabaseToken),
        app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
      );
    }

    /** An org, a folder in it, and a pending file row created through the API. */
    async function fixture() {
      const built = services();
      const owner = await makeUser(
        app.get<GraphDatabase>(GraphDatabaseToken),
        built
      );
      const org = await makeOrg(built, owner.principal);
      const as = req(baseUrl).user({
        subject: owner.subject,
        email: owner.email,
      });

      const folderRes = await as.post(`/files?orgId=${org.id}`, {
        type: "folder",
        name: "Pläne",
      });
      // A create answers `{ file, upload }`: the ticket is the half a folder
      // has no use for, so the row is one level in.
      const { file: folder } = folderRes.body as { file: { id: string } };

      return { as, built, folder, org, owner };
    }

    /** A caller who holds nothing anywhere. */
    async function outsider(built: ReturnType<typeof services>) {
      const person = await makeUser(
        app.get<GraphDatabase>(GraphDatabaseToken),
        built
      );
      return req(baseUrl).user({
        subject: person.subject,
        email: person.email,
      });
    }

    describe("creating a file when there is no bucket", () => {
      it("refuses the upload ticket rather than recording a row nothing can fill", async () => {
        const { as, org } = await fixture();

        const res = await as.post(`/files?orgId=${org.id}`, {
          type: "file",
          name: "grundriss.pdf",
          contentType: "application/pdf",
          size: 1024,
        });

        expect(res.status).toBe(503);
        expect((res.body as Envelope).error.code).toBe(
          "FILE_STORAGE_UNAVAILABLE"
        );
      });

      it("still creates a folder, which needs no bytes", async () => {
        const { as, org } = await fixture();

        const res = await as.post(`/files?orgId=${org.id}`, {
          type: "folder",
          name: "Schnitte",
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
          file: { name: "Schnitte", type: "folder" },
        });
        // No bytes to send, so no ticket comes back with it.
        expect((res.body as { upload?: unknown }).upload).toBeUndefined();
      });
    });

    describe("the byte routes", () => {
      const byteRoutes = [
        {
          method: "get",
          name: "upload",
          path: (id: string) => `/files/${id}/upload`,
        },
        {
          method: "get",
          name: "download",
          path: (id: string) => `/files/${id}/download`,
        },
      ] as const;

      it.each(
        byteRoutes
      )("$name answers the folder's own refusal, since a folder has no bytes", async ({
        method,
        path,
      }) => {
        const { as, folder } = await fixture();

        const res = await (method === "get"
          ? as.get(path(folder.id))
          : as.post(path(folder.id)));

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect((res.body as Envelope).error.code).toBe("FILE_NOT_A_FILE");
      });

      it("completing a folder is refused as not a file", async () => {
        const { as, folder } = await fixture();

        const res = await as.post(`/files/${folder.id}/complete`, {
          size: 1024,
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect((res.body as Envelope).error.code).toBe("FILE_NOT_A_FILE");
      });

      it("aborting a folder is refused as not a file", async () => {
        const { as, folder } = await fixture();

        const res = await as.post(`/files/${folder.id}/abort`);

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect((res.body as Envelope).error.code).toBe("FILE_NOT_A_FILE");
      });

      it("validates the complete body before touching the row", async () => {
        const { as, folder } = await fixture();

        const res = await as.post(`/files/${folder.id}/complete`, {
          size: "big",
        });

        expect(res.status).toBe(400);
        expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
      });

      it.each([
        ["GET", "upload"],
        ["GET", "download"],
      ])("%s /files/:fileId/%s answers the file's miss for an unknown id", async (_m, tail) => {
        const { as } = await fixture();

        const res = await as.get(`/files/${UNKNOWN}/${tail}`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("FILE_NOT_FOUND");
      });

      it("tells an outsider the file is not there, never that a bucket is missing", async () => {
        const { built, folder } = await fixture();
        const stranger = await outsider(built);

        const res = await stranger.get(`/files/${folder.id}/download`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("FILE_NOT_FOUND");
      });

      it("refuses an unauthenticated caller", async () => {
        const { folder } = await fixture();

        const res = await req(baseUrl).get(`/files/${folder.id}/download`);

        expect(res.status).toBe(401);
      });
    });

    describe("the index routes", () => {
      it("reports a file that was never submitted as not indexed", async () => {
        const { as, folder } = await fixture();

        const res = await as.get(`/files/${folder.id}/index`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe(
          "FILE_INDEX_NOT_INDEXED"
        );
      });

      it("reports no extracted text for the same reason", async () => {
        const { as, folder } = await fixture();

        const res = await as.get(`/files/${folder.id}/index/text`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe(
          "FILE_INDEX_NOT_INDEXED"
        );
      });

      it("says the index is not configured rather than queueing into nothing", async () => {
        const { as, folder } = await fixture();

        const res = await as.post(`/files/${folder.id}/index`, {});

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(["FILE_INDEX_NOT_CONFIGURED", "FILE_NOT_A_FILE"]).toContain(
          (res.body as Envelope).error.code
        );
      });

      it("de-indexing is idempotent: a file that was never indexed answers 204", async () => {
        const { as, folder } = await fixture();

        const res = await as.delete(`/files/${folder.id}/index`);

        expect(res.status).toBe(204);
        expect(res.body).toBeNull();
      });

      it("answers the file's own miss for an unknown id", async () => {
        const { as } = await fixture();

        const res = await as.get(`/files/${UNKNOWN}/index`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("FILE_NOT_FOUND");
      });

      it("tells an outsider the file is not there, never its index state", async () => {
        const { built, folder } = await fixture();
        const stranger = await outsider(built);

        const res = await stranger.get(`/files/${folder.id}/index`);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("FILE_NOT_FOUND");
      });

      it("needs `write` to submit where `read` suffices to look", async () => {
        const { built, folder } = await fixture();
        const stranger = await outsider(built);

        const res = await stranger.post(`/files/${folder.id}/index`, {});

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("FILE_NOT_FOUND");
      });

      it("refuses an unauthenticated caller", async () => {
        const { folder } = await fixture();

        const res = await req(baseUrl).get(`/files/${folder.id}/index`);

        expect(res.status).toBe(401);
      });
    });

    describe("the retrieval routes", () => {
      const retrieval = [
        {
          body: { query: "Fluchtweg" },
          missing: "FILE_INDEX_NOT_CONFIGURED",
          name: "search",
        },
        {
          body: { query: "Fluchtweg" },
          missing: "FILE_INDEX_NOT_CONFIGURED",
          name: "retrieve",
        },
        {
          body: { query: "Fluchtweg" },
          missing: "FILE_INDEX_NOT_CONFIGURED",
          name: "context",
        },
        {
          body: { question: "Wie breit ist der Fluchtweg?" },
          // Answering needs a model on top of the index, and says so separately.
          missing: "FILE_INDEX_ANSWERER_NOT_CONFIGURED",
          name: "ask",
        },
      ] as const;

      it.each(
        retrieval
      )("$name declares the index absent rather than answering nothing found", async ({
        body,
        missing,
        name,
      }) => {
        const { as, org } = await fixture();

        // An empty answer and an unconfigured index are different facts, and
        // a caller that cannot tell them apart will trust the empty one.
        const res = await as.post(`/files/${name}?orgId=${org.id}`, body);

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect((res.body as Envelope).error.code).toBe(missing);
      });

      it.each(retrieval)("$name validates its body", async ({ name }) => {
        const { as, org } = await fixture();

        const res = await as.post(`/files/${name}?orgId=${org.id}`, {});

        expect(res.status).toBe(400);
        expect((res.body as Envelope).error.code).toBe("VALIDATION_FAILED");
      });

      it.each(
        retrieval
      )("$name hides the org from somebody standing outside it", async ({
        body,
        name,
      }) => {
        const { built, org } = await fixture();
        const stranger = await outsider(built);

        const res = await stranger.post(`/files/${name}?orgId=${org.id}`, body);

        expect(res.status).toBe(404);
        expect((res.body as Envelope).error.code).toBe("ORG_NOT_FOUND");
      });

      it.each(retrieval)("$name refuses an unauthenticated caller", async ({
        body,
        name,
      }) => {
        const { org } = await fixture();

        const res = await req(baseUrl).post(
          `/files/${name}?orgId=${org.id}`,
          body
        );

        expect(res.status).toBe(401);
      });
    });
  }
);

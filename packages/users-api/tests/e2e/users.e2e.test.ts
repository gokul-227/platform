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

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "/me + /users (e2e)",
  () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      ({ app, baseUrl } = await bootstrapTestApp());

      // Before the first `truncateAll`, which reads `group` to clear its

      // tuples and fails on an unmigrated database rather than on an

      // assertion.

      await ensureMigrated(app.get<pg.Pool>(DatabasePoolToken));
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(async () => {
      await truncateAll(app.get<pg.Pool>(DatabasePoolToken));
      resetSeq();
    });

    it("GET /me returns the authenticated user", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const services = buildServices(
        db,
        app.get<TenancyDatabase>(TenancyDatabaseToken),
        app.get<UsersDatabase>(UsersDatabaseToken),
        app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
      );
      const user = await makeUser(db, services, { name: "Me" });

      const res = await req(baseUrl)
        .user({ subject: user.subject, email: user.email })
        .get("/me");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: user.id, name: "Me" });
    });

    it("GET /me 401s without an X-User-Id header", async () => {
      const res = await req(baseUrl).get("/me");
      expect(res.status).toBe(401);
    });

    it("PATCH /me updates the avatar and drops anything else", async () => {
      const db = app.get<GraphDatabase>(GraphDatabaseToken);
      const services = buildServices(
        db,
        app.get<TenancyDatabase>(TenancyDatabaseToken),
        app.get<UsersDatabase>(UsersDatabaseToken),
        app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
      );
      const user = await makeUser(db, services);

      const res = await req(baseUrl)
        .user({ subject: user.subject, email: user.email })
        .patch("/me", {
          picture: "https://cdn.test/a.png",
          name: "Renamed",
          staffRole: "admin",
        });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ picture: "https://cdn.test/a.png" });
      // Nothing a caller sends can grant them anything: the staff role is the
      // identity provider's to set and is not a field on this row at all.
      expect(res.body).not.toHaveProperty("staffRole");
      // The name is the identity's, and the provider's webhook is its only
      // writer. Sending one here is dropped rather than honoured.
      expect(res.body).toMatchObject({ name: user.name });
    });
  }
);

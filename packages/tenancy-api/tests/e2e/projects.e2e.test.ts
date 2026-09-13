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

describe.skipIf(!(dbAvailable() && ketoAvailable()))(
  "/orgs/:orgId/projects (e2e)",
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

    function dbInstance() {
      return app.get<GraphDatabase>(GraphDatabaseToken);
    }

    it("someone outside the org sees an empty list, not a refusal", async () => {
      const db = dbInstance();
      const services = buildServices(
        db,
        app.get<TenancyDatabase>(TenancyDatabaseToken),
        app.get<UsersDatabase>(UsersDatabaseToken),
        app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
      );
      const owner = await makeUser(db, services);
      const stranger = await makeUser(db, services);
      const org = await makeOrg(services, owner.principal);
      await makeProject(services, org.id, owner.principal);

      // Project routes scope under the org so a non-member of the org gets
      // ACCESS_FORBIDDEN at the ContextGuard layer, regardless of project state.
      const res = await req(baseUrl)
        .user({ subject: stranger.subject, email: stranger.email })
        .get(`/orgs/${org.id}/projects`);
      // Bounded, not gated: a list returns what the caller may read, and an org
      // they hold nothing in contributes nothing. Refusing instead would confirm
      // the org exists to someone who cannot see it.
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: [] });
    });

    it("owner can read a project they own", async () => {
      const db = dbInstance();
      const services = buildServices(
        db,
        app.get<TenancyDatabase>(TenancyDatabaseToken),
        app.get<UsersDatabase>(UsersDatabaseToken),
        app.get<AuthorizationDatabase>(AuthorizationDatabaseToken)
      );
      const owner = await makeUser(db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);

      const res = await req(baseUrl)
        .user({ subject: owner.subject, email: owner.email })
        .get(`/projects/${project.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: project.id, slug: project.slug });
    });
  }
);

import { randomUUID } from "node:crypto";

import { graphVersion } from "@aec-craft/platform-graph-api";
import {
  buildServices,
  createEdge,
  createNode,
  dbAvailable,
  deleteNode,
  makeOrg,
  makeProject,
  makeUser,
  orgScope,
  projectScope,
  resetSeq,
  updateNode,
  useTestDb,
} from "@aec-craft/platform-testing";
import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe.skipIf(!dbAvailable())("GraphVersionService (integration)", () => {
  const ctx = useTestDb();

  describe("record", () => {
    it("lands a row with the event fields inside the caller's transaction", async () => {
      resetSeq();
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const entityId = randomUUID();
      const orgId = randomUUID();
      const projectId = randomUUID();
      const actorId = randomUUID();
      const groupId = randomUUID();

      await ctx.db.transaction(async (trx) => {
        await services.graphVersions.record(trx, {
          entityType: "node",
          entityId,
          op: "created",
          groupId,
          version: "1",
          orgId,
          projectId,
          actorId,
          contentHash: "ab".repeat(32),
          snapshot: { id: entityId, name: "Room 1.01" },
        });
      });

      const rows = await ctx.db.select().from(graphVersion);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        entityType: "node",
        entityId,
        op: "created",
        groupId,
        version: "1",
        orgId,
        projectId,
        actorId,
        contentHash: "ab".repeat(32),
        snapshot: { id: entityId, name: "Room 1.01" },
      });
      // bigserial seq maps to a JS number (`mode: "number"`).
      expect(typeof rows[0]?.seq).toBe("number");
      expect(rows[0]?.createdAt).toBeInstanceOf(Date);
      expect(rows[0]?.syncedAt).toBeNull();
    });

    it("seq increases monotonically across node and edge kinds", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const project = await makeProject(services, org.id, owner.principal);
      const scope = await projectScope(services, project.id);

      const a = await createNode(services, scope, {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });
      const b = await createNode(services, scope, {
        type: "object",
        class: "space.residential.bathroom",
        name: "B",
      });
      const edge = await createEdge(services, scope, {
        sourceId: a.id,
        targetId: b.id,
        type: "adjacentTo",
      });

      const rows = await ctx.db
        .select()
        .from(graphVersion)
        .orderBy(asc(graphVersion.seq));
      expect(rows.map((r) => [r.entityType, r.entityId])).toEqual([
        ["node", a.id],
        ["node", b.id],
        ["edge", edge.id],
      ]);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]?.seq ?? 0).toBeGreaterThan(rows[i - 1]?.seq ?? 0);
      }
    });
  });

  describe("claimUnsynced", () => {
    async function seedThreeNodes(services: ReturnType<typeof buildServices>) {
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const scope = await orgScope(services, org.id);
      for (const name of ["A", "B", "C"]) {
        await createNode(services, scope, {
          type: "object",
          class: "space.residential.kitchen",
          name,
        });
      }
    }

    it("returns only unsynced rows, oldest first, respecting the limit", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      await seedThreeNodes(services);

      const all = await ctx.db
        .select()
        .from(graphVersion)
        .orderBy(asc(graphVersion.seq));
      expect(all).toHaveLength(3);

      // Mark the oldest row synced; it must drop out of the claim.
      await ctx.db.transaction(async (trx) => {
        await services.graphVersions.markSynced(trx, [all[0]?.seq ?? 0]);
      });

      const limited = await ctx.db.transaction(
        async (trx) => await services.graphVersions.claimUnsynced(trx, 1)
      );
      expect(limited.map((r) => r.seq)).toEqual([all[1]?.seq]);

      const rest = await ctx.db.transaction(
        async (trx) => await services.graphVersions.claimUnsynced(trx, 10)
      );
      expect(rest.map((r) => r.seq)).toEqual([all[1]?.seq, all[2]?.seq]);
    });

    it("FOR UPDATE SKIP LOCKED: a concurrent claim skips rows another txn holds", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const scope = await orgScope(services, org.id);
      for (const name of ["A", "B", "C", "D"]) {
        await createNode(services, scope, {
          type: "object",
          class: "space.residential.kitchen",
          name,
        });
      }

      // Txn A claims a batch of 2 and holds the locks (no commit) while txn B
      // claims with a limit covering every row. SKIP LOCKED must hand B only
      // the rows A didn't lock.
      let aSeqs: number[] = [];
      let signalClaimed!: () => void;
      const aClaimed = new Promise<void>((resolve) => {
        signalClaimed = resolve;
      });
      let releaseA!: () => void;
      const aReleased = new Promise<void>((resolve) => {
        releaseA = resolve;
      });

      const txnA = ctx.db.transaction(async (trx) => {
        const claimed = await services.graphVersions.claimUnsynced(trx, 2);
        aSeqs = claimed.map((r) => r.seq);
        signalClaimed();
        await aReleased;
      });

      await aClaimed;
      const bSeqs = await ctx.db.transaction(async (trx) => {
        const claimed = await services.graphVersions.claimUnsynced(trx, 10);
        return claimed.map((r) => r.seq);
      });
      releaseA();
      await txnA;

      expect(aSeqs).toHaveLength(2);
      expect(bSeqs).toHaveLength(2);
      const union = new Set([...aSeqs, ...bSeqs]);
      expect(union.size).toBe(4);
    });
  });

  describe("markSynced + history", () => {
    it("markSynced sets syncedAt and removes rows from the claim feed", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const scope = await orgScope(services, org.id);
      const node = await createNode(services, scope, {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });
      await updateNode(services, scope, node.id, { name: "K renamed" });

      const claimed = await ctx.db.transaction(async (trx) => {
        const batch = await services.graphVersions.claimUnsynced(trx, 100);
        await services.graphVersions.markSynced(
          trx,
          batch.map((r) => r.seq)
        );
        return batch;
      });
      expect(claimed).toHaveLength(2);

      const after = await ctx.db.select().from(graphVersion);
      for (const row of after) {
        expect(row.syncedAt).toBeInstanceOf(Date);
      }

      const again = await ctx.db.transaction(
        async (trx) => await services.graphVersions.claimUnsynced(trx, 100)
      );
      expect(again).toHaveLength(0);
    });

    it("markSynced with an empty seq list is a no-op", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      await ctx.db.transaction(async (trx) => {
        await services.graphVersions.markSynced(trx, []);
      });
      // No rows, no error.
      expect(await ctx.db.select().from(graphVersion)).toHaveLength(0);
    });

    it("history returns all rows for an entity, oldest first", async () => {
      const services = buildServices(
        ctx.db,
        ctx.tenancyDb,
        ctx.usersDb,
        ctx.authorizationDb
      );
      const owner = await makeUser(ctx.db, services);
      const org = await makeOrg(services, owner.principal);
      const scope = await orgScope(services, org.id);
      const node = await createNode(services, scope, {
        type: "object",
        class: "space.residential.kitchen",
        name: "K",
      });
      // Decoy entity: history must not pick it up.
      await createNode(services, scope, {
        type: "object",
        class: "space.residential.bathroom",
        name: "B",
      });
      await updateNode(services, scope, node.id, { name: "K renamed" });
      await deleteNode(services, scope, node.id);

      const history = await services.graphVersions.history("node", node.id);
      expect(history.map((r) => r.op)).toEqual([
        "created",
        "updated",
        "deleted",
      ]);
      expect(history.map((r) => r.version)).toEqual(["1", "2", "2"]);
      for (let i = 1; i < history.length; i++) {
        expect(history[i]?.seq ?? 0).toBeGreaterThan(history[i - 1]?.seq ?? 0);
      }
      expect(history.at(-1)?.snapshot).toBeNull();
    });
  });
});

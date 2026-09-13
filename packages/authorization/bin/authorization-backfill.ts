#!/usr/bin/env node
import { STANDINGS } from "@aec-craft/platform-contracts";
/**
 * `authorization-backfill` — turns the retiring membership rows into Keto
 * tuples. Run once, between the group seed and the directory migration that
 * drops the tables it reads.
 *
 *   pnpm --filter @aec-craft/platform-authorization migrate    # 0000 + 0001
 *   pnpm --filter @aec-craft/platform-authorization backfill   # this
 *   pnpm --filter @aec-craft/platform-tenancy-api migrate      # drops them
 *
 * SQL cannot do this: the tuples live in Keto, not in Postgres, which is the
 * whole point of the migration. Everything here is delete-then-write, so a
 * re-run converges rather than duplicating.
 *
 * Nothing is inferred. A role name that is not one of the five standings maps
 * to `viewer` and says so on stdout: guessing a standing from a custom role's
 * permission array would silently hand someone more reach than a staff member
 * chose, and under-granting is the failure that gets reported rather than
 * exploited.
 */
import { Pool } from "pg";
import { KetoClient } from "../src/keto/keto.client";
import {
  parentTuple,
  type RelationTuple,
  rosterJoinTuples,
  standingTuple,
  type TupleDelta,
} from "../src/keto/keto.tuples";

const STANDING_NAMES: readonly string[] = STANDINGS;

async function main(): Promise<void> {
  // Falls back the same way the migrators do: a slice shares `DATABASE_URL`
  // unless it has been split onto its own database.
  const databaseUrl =
    process.env.AUTHORIZATION_DATABASE_URL ?? requireEnv("DATABASE_URL");
  const keto = new KetoClient({
    readUrl: requireEnv("KETO_READ_URL"),
    writeUrl: requireEnv("KETO_WRITE_URL"),
    identityTokens: process.env.KETO_IDENTITY_TOKENS === "true",
    timeoutMs: 10_000,
  });
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Nothing to convert once the directory migration has dropped the tables.
    // Say so and exit clean, so re-running the chain is safe.
    const pending = await pool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.org_member') IS NOT NULL AS exists"
    );
    if (!pending.rows[0]?.exists) {
      say("no membership tables left to convert; nothing to do");
      return;
    }

    const deltas: TupleDelta[] = [];

    // The tree: every project group hangs off its org's root, and joins that
    // root's roster in both directions so org staff see the project and the
    // project's people see each other.
    const projects = await pool.query<{ id: string; root: string }>(
      `SELECT p.id, root.id AS root
         FROM "group" AS p
         JOIN "group" AS root ON root.org_id = p.org_id AND root.type = 'org'
        WHERE p.type = 'project'`
    );
    for (const project of projects.rows) {
      deltas.push(insert(parentTuple(project.id, project.root)));
      for (const tuple of rosterJoinTuples(project.id, project.root)) {
        deltas.push(insert(tuple));
      }
    }
    say(`${projects.rowCount ?? 0} project groups joined to their org root`);

    // Standings. The subject is the identity id the token asserts, so a user
    // row that never came from the identity provider has nobody to grant to.
    const members = await pool.query<{
      group_id: string;
      subject: string | null;
      role: string;
      scope: string;
    }>(
      `SELECT g.id AS group_id, u.external_id AS subject, m.role, 'org' AS scope
         FROM org_member AS m
         JOIN "user" AS u ON u.id = m.user_id
         JOIN "group" AS g ON g.org_id = m.org_id AND g.type = 'org'
       UNION ALL
       SELECT g.id AS group_id, u.external_id AS subject, m.role, 'project' AS scope
         FROM project_member AS m
         JOIN "user" AS u ON u.id = m.user_id
         JOIN "group" AS g ON g.project_id = m.project_id AND g.type = 'project'`
    );

    let skipped = 0;
    let downgraded = 0;
    for (const member of members.rows) {
      if (!member.subject) {
        skipped += 1;
        continue;
      }
      const known = STANDING_NAMES.includes(member.role);
      if (!known) {
        downgraded += 1;
        say(
          `  role '${member.role}' on ${member.scope} group ${member.group_id} is not a standing; granting viewer`
        );
      }
      const standing = (known ? member.role : "viewer") as
        | "owner"
        | "manager"
        | "editor"
        | "viewer";
      // Delete every standing first: a member holding two would read as a
      // promotion that did not take, and a re-run would otherwise stack them.
      for (const name of STANDINGS) {
        deltas.push(
          remove(standingTuple(member.group_id, name, member.subject))
        );
      }
      deltas.push(
        insert(standingTuple(member.group_id, standing, member.subject))
      );
    }
    say(
      `${members.rowCount ?? 0} memberships, ${skipped} skipped with no identity, ${downgraded} custom roles granted viewer`
    );

    await keto.patch(deltas);
    say(`${deltas.length} tuple operations applied`);
  } finally {
    await pool.end();
  }
}

function insert(relation_tuple: RelationTuple): TupleDelta {
  return { action: "insert", relation_tuple };
}

function remove(relation_tuple: RelationTuple): TupleDelta {
  return { action: "delete", relation_tuple };
}

function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});

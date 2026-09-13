/**
 * The three client surfaces against a live host: the SDK, the MCP tools, and
 * the admin SDK.
 *
 * `surface.coverage.e2e` proves every published route has a method and every
 * tool points at a route the server serves — but it proves it against a
 * recording transport that refuses every call, so nothing in it has ever
 * round-tripped. This does: one org, one project, a member, a file, a
 * changeset, then the same rows read back through each surface.
 *
 * Prereqs are the e2e suites' own — Postgres on 5433 and Keto on 4466/4467 —
 * plus nothing else: no bucket, no graph DB, no LLM. It runs against
 * `platform_test` and WIPES it.
 *
 * Run: `pnpm -C apps/api surface:smoke`. CJS require hook rather than the ESM
 * loader, because this package is CommonJS and a decorated class compiled to
 * CJS has no statically-visible named export for an ESM importer.
 */

import "reflect-metadata";

import { AdminClient } from "@aec-craft/platform-admin-sdk";
import { ALL_TOOLS } from "@aec-craft/platform-mcp-tools";
import { PlatformClient } from "@aec-craft/platform-sdk";
import {
  bootstrapTestApp,
  createTestPool,
  ensureMigrated,
  truncateAll,
} from "@aec-craft/platform-testing/harness";
import type { INestApplication } from "@nestjs/common";
import type pg from "pg";
import { McpModule } from "../src/mcp/mcp.module";

/** Not 3100: a dev server may hold it, and this must not dispatch into one. */
const PORT = 3188;
const SUBJECT = "smoke-owner";
const STAFF = "smoke-staff";

interface Check {
  detail: string;
  label: string;
  pass: boolean;
}

const checks: Check[] = [];

function record(label: string, pass: boolean, detail = ""): void {
  checks.push({ label, pass, detail });
  console.log(
    `${pass ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  );
}

/** The SDK, pointed at the booted host, acting as one subject. */
function clientFor(baseUrl: string, subject: string, staffRole?: string) {
  const headers: Record<string, string> = { "x-test-subject": subject };
  if (staffRole) {
    headers["x-test-staff-role"] = staffRole;
  }
  return { baseUrl, getAuthHeaders: () => Promise.resolve(headers) };
}

async function callTool(
  baseUrl: string,
  subject: string,
  name: string,
  args: Record<string, unknown>
): Promise<{ isError?: boolean; text: string }> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Both: the outer hop reads the header, and the inner one — the endpoint
      // dispatching the tool back to this host — carries only the bearer.
      "x-test-subject": subject,
      authorization: `Bearer test:${subject}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = (await res.json()) as {
    result?: { content?: Array<{ text?: string }>; isError?: boolean };
  };
  if (process.env.SMOKE_DEBUG) {
    console.log("  raw", res.status, JSON.stringify(body).slice(0, 300));
  }
  return {
    isError: body.result?.isError,
    text: body.result?.content?.[0]?.text ?? "",
  };
}

async function main(): Promise<void> {
  const pool: pg.Pool = createTestPool();
  await ensureMigrated(pool);
  await truncateAll(pool);

  let app: INestApplication | undefined;
  try {
    // The MCP endpoint dispatches a tool call back to this host over loopback
    // at `PORT`, so the port has to be known before the app is built.
    process.env.PORT = String(PORT);
    const booted = await bootstrapTestApp({
      imports: [McpModule],
      port: PORT,
    });
    app = booted.app;
    const { baseUrl } = booted;

    // A profile has to exist before a subject can act: the identity webhook
    // writes it in the real world, and nothing here speaks to Kratos.
    await pool.query(
      `INSERT INTO "user" (email, name, external_id) VALUES ($1, $2, $3), ($4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [
        "smoke.owner@example.test",
        "Smoke Owner",
        SUBJECT,
        "smoke.staff@example.test",
        "Smoke Staff",
        STAFF,
      ]
    );

    const sdk = new PlatformClient(clientFor(baseUrl, SUBJECT));
    const admin = new AdminClient(clientFor(baseUrl, STAFF, "admin"));

    // ── the SDK writes ──────────────────────────────────────────────────────
    const org = await sdk.orgs.create({ name: "Smoke Works" });
    record("sdk    orgs.create", Boolean(org.id), org.slug);

    const project = await sdk.projects.create(org.id, { name: "Smoke Tower" });
    record("sdk    projects.create", Boolean(project.id), project.slug);

    const me = await sdk.me.get();
    record("sdk    me.get", me.email === "smoke.owner@example.test", me.email);

    const standings = await sdk.me.standings(org.id);
    record(
      "sdk    me.standings",
      standings.items.some((row) => row.standing === "owner"),
      `${standings.items.length} partitions`
    );

    // ── members, the surface this refactor replaced ─────────────────────────
    const orgScope = { type: "org", orgId: org.id } as const;
    const projectScope = { type: "project", projectId: project.id } as const;

    await sdk.members.add(orgScope, {
      email: "smoke.staff@example.test",
      standing: "editor",
    });
    const orgMembers = await sdk.members.list(orgScope);
    record(
      "sdk    members.add + list (org)",
      orgMembers.items.some(
        (row) => row.email === "smoke.staff@example.test"
      ) && orgMembers.items.some((row) => row.standing === "owner"),
      `${orgMembers.total} members`
    );

    const projectMembers = await sdk.members.list(projectScope);
    record(
      "sdk    members.list (project) carries the org down",
      projectMembers.items.some((row) => row.source === "inherited"),
      projectMembers.items.map((row) => row.source).join(", ")
    );

    await sdk.members.setStanding(orgScope, STAFF, "manager");
    const promoted = await sdk.members.list(orgScope);
    record(
      "sdk    members.setStanding",
      promoted.items.some(
        (row) => row.subject === STAFF && row.standing === "manager"
      )
    );

    // ── files and the graph ─────────────────────────────────────────────────
    const folder = await sdk.files.createFolder(projectScope, {
      name: "Drawings",
    });
    const files = await sdk.files.list(projectScope);
    record(
      "sdk    files.createFolder + list",
      files.items.some((row) => row.id === folder.id),
      `${files.items.length} rows`
    );

    const applied = await sdk.graph.apply(projectScope, {
      nodes: [
        {
          op: "create",
          type: "object",
          class: "space",
          name: "Ward 3",
          properties: { programme: { use: "ward" } },
        },
        { op: "create", type: "rule", class: "rule", name: "Egress width" },
      ],
      edges: [],
    });
    record(
      "sdk    graph.apply",
      applied.nodes.items.length === 2,
      `${applied.nodes.items.length} nodes`
    );

    const nodes = await sdk.graph.nodes.list(projectScope);
    record("sdk    graph.nodes.list", nodes.items.length === 2);

    const objects = await sdk.objects.list(projectScope);
    record(
      "sdk    objects.list narrows to one type",
      objects.items.length === 1 && objects.items[0]?.type === "object",
      objects.items.map((row) => row.name).join(", ")
    );

    const rules = await sdk.rules.list(projectScope);
    record(
      "sdk    rules.list narrows to the other",
      rules.items.length === 1 && rules.items[0]?.type === "rule",
      rules.items.map((row) => row.name).join(", ")
    );

    const audit = await sdk.audit.list(orgScope, {});
    record(
      "sdk    audit.list sees the writes",
      audit.items.some((row) => row.resource === "member") &&
        audit.items.some((row) => row.resource === "org"),
      [...new Set(audit.items.map((row) => row.resource))].join(", ")
    );

    // ── the MCP tools, over the same rows ───────────────────────────────────
    record(
      "mcp    tools registered",
      ALL_TOOLS.length > 0,
      `${ALL_TOOLS.length} tools`
    );

    const listed = await callTool(baseUrl, SUBJECT, "orgs_list", {});
    record(
      "mcp    orgs_list",
      !listed.isError && listed.text.includes("Smoke Works")
    );

    const mcpNodes = await callTool(baseUrl, SUBJECT, "graph_nodes_list", {
      projectId: project.id,
    });
    record(
      "mcp    graph_nodes_list",
      !mcpNodes.isError && mcpNodes.text.includes("Ward 3")
    );

    const mcpFiles = await callTool(baseUrl, SUBJECT, "files_list", {
      projectId: project.id,
    });
    record(
      "mcp    files_list",
      !mcpFiles.isError && mcpFiles.text.includes("Drawings")
    );

    const mcpAudit = await callTool(baseUrl, SUBJECT, "audit_events_list", {
      orgId: org.id,
    });
    record(
      "mcp    audit_events_list",
      !mcpAudit.isError && mcpAudit.text.includes("member")
    );

    const refused = await callTool(baseUrl, "nobody-at-all", "orgs_list", {});
    record(
      "mcp    refuses a subject with no profile",
      Boolean(refused.isError) || !refused.text.includes("Smoke Works")
    );

    // ── the admin SDK, which reads past every standing ──────────────────────
    const estate = await admin.orgs.list();
    record(
      "admin  orgs.list spans the estate",
      estate.items.some((row) => row.id === org.id),
      `${estate.total} orgs`
    );

    const estateProjects = await admin.projects.list();
    record(
      "admin  projects.list spans the estate",
      estateProjects.items.some((row) => row.id === project.id)
    );

    const users = await admin.users.list();
    record(
      "admin  users.list",
      users.items.some((row) => row.email === "smoke.owner@example.test"),
      `${users.total} users`
    );

    let staffOnly = false;
    try {
      await new AdminClient(clientFor(baseUrl, SUBJECT)).orgs.list();
    } catch {
      staffOnly = true;
    }
    record("admin  refuses a caller who is not staff", staffOnly);
  } finally {
    await app?.close();
    await pool.end();
  }

  const failed = checks.filter((check) => !check.pass);
  console.log(
    `\n${checks.length - failed.length}/${checks.length} checks passed`
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

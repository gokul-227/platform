#!/usr/bin/env node
// One migrations table per slice, because they share the platform database. The
// genesis is `IF NOT EXISTS` throughout, so a database already carrying
// `audit_event` baselines by running it.
import { runMigrateCli } from "@aec-craft/platform-common/drizzle";

void runMigrateCli({
  envVar: "AUDIT_DATABASE_URL",
  migrationsTable: "__drizzle_migrations_audit",
});

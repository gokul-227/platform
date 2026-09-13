#!/usr/bin/env node
// One migrations table per slice, because they share the platform database. The
// genesis is `IF NOT EXISTS` throughout, so a database already carrying `org`
// and `project` baselines by running it.
//
// Run it after `authorization-backfill`, which `apps/api`'s `db:migrate`
// sequences: this drops the membership tables the backfill reads.
import { runMigrateCli } from "@aec-craft/platform-common/drizzle";

void runMigrateCli({
  envVar: "TENANCY_DATABASE_URL",
  migrationsTable: "__drizzle_migrations_tenancy",
});

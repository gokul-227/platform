#!/usr/bin/env node
// One migrations table per slice, because they share the platform database. The
// genesis is `IF NOT EXISTS` throughout, so a database already carrying
// `thread` baselines by running it.
import { runMigrateCli } from "@aec-craft/platform-common/drizzle";

void runMigrateCli({
  envVar: "THREADS_DATABASE_URL",
  migrationsTable: "__drizzle_migrations_threads",
});

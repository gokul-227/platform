#!/usr/bin/env node
// The journal table keeps the name it was created under: the genesis is a bare
// `CREATE TABLE "group"`, so a renamed journal replays it and fails on every
// database that already has the table.
import { runMigrateCli } from "@aec-craft/platform-common/drizzle";

void runMigrateCli({
  envVar: "AUTHORIZATION_DATABASE_URL",
  migrationsTable: "__drizzle_migrations_permissions",
});

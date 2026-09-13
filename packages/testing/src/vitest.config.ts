import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type ViteUserConfig } from "vitest/config";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES = path.resolve(HERE, "../..");

/**
 * Every workspace specifier pointed at its own source.
 *
 * Without this a suite runs against `dist`, which is a different program: a
 * package edited but not rebuilt is tested in its last-built state, and v8
 * coverage of `src` reads zero because no line of it was ever loaded. The map
 * is derived from each package's own `exports`, so a new entry point needs no
 * change here — `dist/nest.js` resolves to `src/nest/index.ts` or `src/nest.ts`,
 * whichever exists.
 */
function workspaceSourceAliases(): Array<{
  find: string;
  replacement: string;
}> {
  const aliases: Array<{ find: string; replacement: string }> = [];
  for (const dir of fs.readdirSync(PACKAGES)) {
    const manifest = path.join(PACKAGES, dir, "package.json");
    if (!fs.existsSync(manifest)) {
      continue;
    }
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8")) as {
      exports?: Record<string, unknown>;
      name?: string;
    };
    if (!(pkg.name && pkg.exports)) {
      continue;
    }
    for (const [subpath, condition] of Object.entries(pkg.exports)) {
      const target = distTarget(condition);
      if (!target?.startsWith("./dist/")) {
        continue;
      }
      const stem = target.slice("./dist/".length).replace(/\.js$/, "");
      const source = [
        path.join(PACKAGES, dir, "src", `${stem}.ts`),
        path.join(PACKAGES, dir, "src", stem, "index.ts"),
      ].find((candidate) => fs.existsSync(candidate));
      if (source) {
        aliases.push({
          find: pkg.name + (subpath === "." ? "" : subpath.slice(1)),
          replacement: source,
        });
      }
    }
  }
  // Longest first: vite matches a string `find` as a prefix, so
  // `…/platform-sdk` would otherwise swallow `…/platform-sdk/react`.
  return aliases.sort((a, b) => b.find.length - a.find.length);
}

function distTarget(condition: unknown): string | undefined {
  if (typeof condition === "string") {
    return condition;
  }
  const map = condition as { default?: string; import?: { default?: string } };
  return map.import?.default ?? map.default;
}

/**
 * The one vitest configuration every package with a Nest suite extends.
 *
 * Two settings are load-bearing rather than taste:
 *
 *   - The oxc decorator block. Vite 8's default TS transformer does not honor
 *     the package tsconfig's `experimentalDecorators` / `emitDecoratorMetadata`,
 *     which leaves class-validator's metadata empty and every DTO unvalidated.
 *     All three forms are set because oxc's precedence has shifted across
 *     releases.
 *   - `fileParallelism: false`. Integration suites share one Postgres and
 *     truncate between tests, so parallel files race on the same rows. Across
 *     packages the root `pnpm test` serializes for the same reason
 *     (`--workspace-concurrency=1`).
 */
/**
 * The floor each package's own suite holds, as measured rather than aspired to.
 *
 * A ratchet, not a target: raise a number when a suite earns it, never lower one
 * to make a run pass. They live in one file so the whole estate's shape is
 * readable at once, and so a package's config stays two lines.
 *
 * The kernel is the low one that matters. Its guards and its Keto client run
 * mostly through a booted host, and the host's suite lives in `apps/api`, so
 * this number understates it — the honest fix is a Nest-level suite here, not a
 * higher floor.
 */
const COVERAGE_FLOORS: Record<string, number> = {
  "@aec-craft/platform-admin-api": 95,
  "@aec-craft/platform-admin-sdk": 95,
  "@aec-craft/platform-analysis-api": 88,
  "@aec-craft/platform-audit-api": 95,
  "@aec-craft/platform-authorization": 45,
  "@aec-craft/platform-common": 95,
  "@aec-craft/platform-files-api": 64,
  "@aec-craft/platform-graph-api": 86,
  "@aec-craft/platform-graph-client": 95,
  "@aec-craft/platform-mcp-tools": 97,
  "@aec-craft/platform-metadata": 60,
  "@aec-craft/platform-objects-api": 95,
  "@aec-craft/platform-contracts": 76,
  "@aec-craft/platform-rules-api": 95,
  "@aec-craft/platform-sdk": 62,
  "@aec-craft/platform-tenancy-api": 87,
  "@aec-craft/platform-threads-api": 46,
  "@aec-craft/platform-users-api": 80,
};

/** The floor for whichever package is running, read from its own manifest. */
function coverageFloor(): number | undefined {
  const manifest = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(manifest)) {
    return;
  }
  const { name } = JSON.parse(fs.readFileSync(manifest, "utf8")) as {
    name?: string;
  };
  return name ? COVERAGE_FLOORS[name] : undefined;
}

export function defineTestConfig(
  overrides: { coverageInclude?: string[]; include?: string[] } = {}
): ViteUserConfig {
  const floor = coverageFloor();
  return defineConfig({
    resolve: { alias: workspaceSourceAliases() },
    oxc: {
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      useDefineForClassFields: false,
      decorator: {
        legacy: true,
        emitDecoratorMetadata: true,
      },
    } as never,
    test: {
      environment: "node",
      include: overrides.include ?? ["tests/**/*.test.ts", "src/**/*.test.ts"],
      setupFiles: [path.join(HERE, "setup.ts")],
      globalSetup: [path.join(HERE, "global-setup.ts")],
      fileParallelism: false,
      hookTimeout: 30_000,
      testTimeout: 15_000,
      coverage: {
        provider: "v8",
        include: overrides.coverageInclude ?? ["src/**/*.ts"],
        // A DTO class is a zod schema with a decorator and an error catalogue is
        // a literal; neither has a branch to miss, and counting them moves a
        // package's number without anything having been tested.
        exclude: ["src/**/*.dtos.ts", "src/**/*.errors.ts", "**/*.d.ts"],
        reporter: ["text-summary", "json-summary"],
        reportsDirectory: "coverage",
        ...(floor === undefined ? {} : { thresholds: { lines: floor } }),
      },
    },
  });
}

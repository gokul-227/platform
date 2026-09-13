import { defineConfig } from "vitest/config";

/**
 * Its own config rather than the shared factory: `@aec-craft/platform-testing`
 * depends on the API packages, and this one sits under them.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});

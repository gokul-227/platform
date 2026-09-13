import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    nest: "src/nest/index.ts",
    "bin/authorization-migrate": "bin/authorization-migrate.ts",
    "bin/authorization-backfill": "bin/authorization-backfill.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2023",
  treeshake: true,
  external: ["@nestjs/common", "@nestjs/core", "reflect-metadata"],
});

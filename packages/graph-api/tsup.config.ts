import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    nest: "src/nest/index.ts",
    "bin/graph-api-migrate": "bin/graph-api-migrate.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2023",
  treeshake: true,
  external: ["@nestjs/common", "@nestjs/core", "reflect-metadata"],
});

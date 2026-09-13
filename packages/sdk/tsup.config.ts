import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", react: "src/react.ts", ui: "src/ui.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2023",
  treeshake: true,
  external: [
    "react",
    "@tanstack/react-query",
    "@tanstack/react-form",
    /^@aec-craft\/ui/,
  ],
});

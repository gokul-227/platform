import { defineConfig } from "tsup";

export default defineConfig({
  // Two entries so a browser importing the profile never pulls the WASM kernel
  // in behind it. `read` is the only half that touches web-ifc.
  entry: { index: "src/index.ts", read: "src/read/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2023",
  treeshake: true,
  shims: true,
});

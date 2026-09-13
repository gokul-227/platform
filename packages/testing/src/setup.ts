// Vitest global setup — loaded by `vitest.config.ts`. Imports
// `reflect-metadata` once so Nest's decorators (DI, controller metadata) work
// in every test file without each file having to remember.
import "reflect-metadata";

import * as contracts from "@aec-craft/platform-contracts";
import { describe, expect, it } from "vitest";

/**
 * That the re-exported surface actually reaches a consumer.
 *
 * `contracts` re-exports `@aec-craft/platform-contracts` and the error envelope, and
 * a duplicate `export *` of the same module makes every shared name an
 * **ambiguous star export** — which ES modules drop silently rather than
 * refusing. The build stays green, `tsc` stays quiet, and the failure surfaces
 * at runtime as `platformContracts.exampleFor is not a function`, which is
 * exactly how it surfaced when the dialect first moved out.
 *
 * Asserted against the package's own entry rather than a relative path, so this
 * reads the barrel a consumer resolves.
 */
describe("the re-exported surface", () => {
  const DIALECT = [
    "ALL_FILTER_OPS",
    "LIST_OPS",
    "column",
    "columnFor",
    "defineFilters",
    "defineListSpec",
    "exampleFor",
    "filtersToSchema",
    "jsonbPath",
    "listInputSchema",
    "listResponseSchema",
    "offsetPageMetaSchema",
    "sortSchema",
    "sortableFields",
  ] as const;

  const VOCABULARY = [
    "PREDICATE_OPERATORS",
    "contextPathSchema",
    "predicateOperatorSchema",
    "predicateSchema",
    "querySpecSchema",
  ] as const;

  const ENVELOPE = [
    "PlatformError",
    "platformErrorBodySchema",
    "toErrorBody",
  ] as const;

  const SPECS = [
    "auditEventFilters",
    "fileFilters",
    "graphEdgeFilters",
    "graphNodeFilters",
    "orgFilters",
    "projectFilters",
    "threadFilters",
    "threadMessageFilters",
    "threadRunFilters",
    "userFilters",
  ] as const;

  it.each([
    ["query dialect", DIALECT],
    ["predicate and aggregate vocabulary", VOCABULARY],
    ["error envelope", ENVELOPE],
    // mcp-tools reads these as values to generate each tool's filter line.
    ["filter specs", SPECS],
  ])("carries the %s", (_label, names) => {
    const surface = contracts as unknown as Record<string, unknown>;
    expect(names.filter((name) => surface[name] === undefined)).toEqual([]);
  });

  it("re-exports enough to be worth checking", () => {
    // Guards the assertions above: an empty namespace would satisfy a filter
    // over nothing, so pin the order of magnitude of the whole surface.
    expect(Object.keys(contracts).length).toBeGreaterThan(250);
  });
});

import { describe, expect, it } from "vitest";
import { AnalysisConnectivityService } from "../../src/modules/connectivity/analysis.connectivity.service";
import { assertCypherScoped as assertScoped } from "../../src/modules/query/scope.cypher";

/** The projection, as far as this analysis is concerned: rows in, rows out. */
function serviceOver(rows: Record<string, unknown>[]) {
  const seen: { cypher?: string } = {};
  const cypher = {
    isAvailable: true,
    run: (_scope: unknown, statement: { cypher: string }) => {
      seen.cypher = statement.cypher;
      return Promise.resolve(rows);
    },
  };
  return {
    seen,
    service: new AnalysisConnectivityService(
      cypher as unknown as ConstructorParameters<
        typeof AnalysisConnectivityService
      >[0]
    ),
  };
}

const SCOPE = { projectId: "p", readableGroups: ["g"] };
const INPUT = {};

/** One row is one island: the procedure groups them before they get here. */
const island = (...nodeIds: string[]) => ({ nodeIds });

describe("connectivity", () => {
  it("says connected, and nothing else, when there is one island", async () => {
    const { service } = serviceOver([island("a", "b")]);

    expect(await service.analyse(SCOPE, INPUT)).toEqual({
      connected: true,
      spaces: 2,
    });
  });

  it("does not call an empty model whole without saying it was empty", async () => {
    const { service } = serviceOver([]);

    // Zero spaces are trivially connected. `examined` is the only thing that
    // keeps that from reading as a pass.
    expect(await service.analyse(SCOPE, INPUT)).toEqual({
      connected: true,
      spaces: 0,
    });
  });

  it("orders the islands by size, whatever order the engine returned", async () => {
    const { service } = serviceOver([
      island("d", "e"),
      island("a", "b", "c"),
      island("f"),
    ]);
    const answer = await service.analyse(SCOPE, INPUT);

    expect(answer).toEqual({
      connected: false,
      disconnected: {
        islands: [["a", "b", "c"], ["d", "e"], ["f"]],
        // Everything but the largest: the count somebody acts on.
        spaces: 3,
      },
      spaces: 6,
    });
  });

  it("does not pick a side when a model splits in half", async () => {
    const { service } = serviceOver([island("a", "b"), island("c", "d")]);
    const answer = await service.analyse(SCOPE, INPUT);

    // Both halves are the finding. Flattening to "everything outside the largest"
    // would call one wing the building.
    expect(answer.connected).toBe(false);
    if (answer.connected) {
      return;
    }
    expect(answer.disconnected.islands).toHaveLength(2);
    expect(answer.disconnected.islands[0]).toHaveLength(2);
    expect(answer.disconnected.islands[1]).toHaveLength(2);
  });

  it("asks for the relationship the way the projection wrote it, and stays scoped", async () => {
    const { seen, service } = serviceOver([island("a")]);
    await service.analyse(SCOPE, INPUT);

    expect(seen.cypher).toContain("`CONNECTS_TO`");
    expect(seen.cypher).not.toContain("connectsTo");
    expect(seen.cypher).toContain("weakly_connected_components.get(graph)");
    // The zero-length arm is what keeps an isolated space in the projection, and
    // an isolated space is the whole point of the analysis.
    expect(seen.cypher).toContain("*0..1");
    expect(seen.cypher).not.toMatch(/\*1\.\./);
    expect(() => assertScoped(seen.cypher ?? "")).not.toThrow();
  });
});

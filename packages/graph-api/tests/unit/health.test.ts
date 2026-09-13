import { GraphQueryService } from "@aec-craft/platform-graph-api/nest";
import {
  MemgraphDialect,
  Neo4jDialect,
  ProjectionSessionService,
} from "@aec-craft/platform-graph-client";
import type { Driver } from "neo4j-driver";
import { describe, expect, it } from "vitest";

/**
 * The reachability probe touches only `driver.verifyConnectivity()`, so the
 * fakes implement exactly that one method (cast to Driver). No live Memgraph.
 *
 * The probe reads through the session service now, which is where the driver and
 * the dialect live; the service under test holds neither.
 */
function fakeDriver(verifyConnectivity: () => Promise<unknown>): Driver {
  return { verifyConnectivity } as unknown as Driver;
}

/** The service under test, over a session over these two. */
function serviceOver(
  driver: Driver | null,
  dialect: MemgraphDialect | Neo4jDialect
) {
  return new GraphQueryService(new ProjectionSessionService(driver, dialect));
}

/** A ServiceUnavailable-coded rejection, the bolt connectivity-failure shape. */
function serviceUnavailable(): Error & { code: string } {
  return Object.assign(new Error("could not reach graph DB"), {
    code: "ServiceUnavailable",
  });
}

describe("GraphQueryService.health (reachability probe)", () => {
  const input = { projectId: "11111111-1111-1111-1111-111111111111" };
  const scope = { projectId: input.projectId };

  it("reports reachable:false / engine:null when no graph DB is configured", async () => {
    const service = serviceOver(null, new MemgraphDialect());

    await expect(service.health(input, scope)).resolves.toEqual({
      reachable: false,
      engine: null,
      latencyMs: null,
    });
  });

  it("reports reachable:true with the configured engine and a numeric latency", async () => {
    const driver = fakeDriver(() => Promise.resolve());
    const service = serviceOver(driver, new MemgraphDialect());

    const result = await service.health(input, scope);

    expect(result.reachable).toBe(true);
    expect(result.engine).toBe("memgraph");
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("carries the neo4j engine through when that dialect is configured", async () => {
    const driver = fakeDriver(() => Promise.resolve());
    const service = serviceOver(driver, new Neo4jDialect());

    const result = await service.health(input, scope);

    expect(result.reachable).toBe(true);
    expect(result.engine).toBe("neo4j");
  });

  it("reports reachable:false (engine kept) when connectivity fails", async () => {
    const driver = fakeDriver(() => Promise.reject(serviceUnavailable()));
    const service = serviceOver(driver, new MemgraphDialect());

    await expect(service.health(input, scope)).resolves.toEqual({
      reachable: false,
      engine: "memgraph",
      latencyMs: null,
    });
  });
});

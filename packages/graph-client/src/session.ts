import { PlatformError } from "@aec-craft/platform-contracts";
import { Inject, Injectable } from "@nestjs/common";
import type { Record as BoltRecord, Driver } from "neo4j-driver";
import type { GraphDialect } from "./dialect";
import { GraphClientErrors } from "./errors";
import { GraphDialectToken, GraphDriverToken } from "./tokens";

/** Long enough for a real walk, short enough that a runaway one is a failure. */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The session lifecycle, the read-only transaction, the timeout, and the
 * translation of a dropped connection into `GRAPH_UNAVAILABLE`.
 *
 * The guard is deliberately elsewhere: a statement a client typed must be proven
 * read-only and its results scope-checked, while one the repo wrote must be
 * proven to name the scope parameters. Folding both in makes that a flag, and a
 * flag on a security check is where a default is dangerous.
 *
 * Records come back raw, because a wire response and an analysis want different
 * shapes out of the same rows.
 */
@Injectable()
export class ProjectionSessionService {
  constructor(
    @Inject(GraphDriverToken) private readonly driver: Driver | null,
    @Inject(GraphDialectToken) private readonly dialect: GraphDialect
  ) {}

  /** False when no graph database is configured; the driver is then null. */
  get isAvailable(): boolean {
    return this.driver !== null;
  }

  get engine(): GraphDialect["engine"] | null {
    return this.driver ? this.dialect.engine : null;
  }

  async read(
    statement: { params?: Record<string, unknown>; text: string },
    options?: { timeoutMs?: number }
  ): Promise<BoltRecord[]> {
    if (!this.driver) {
      throw new PlatformError(GraphClientErrors.UNAVAILABLE);
    }
    const session = this.driver.session();
    try {
      const result = await session.executeRead(
        (tx) => tx.run(statement.text, statement.params ?? {}),
        { timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS }
      );
      return result.records;
    } catch (error) {
      if (error instanceof PlatformError) {
        throw error;
      }
      if (isConnectivityError(error)) {
        throw new PlatformError(GraphClientErrors.UNAVAILABLE);
      }
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * A round-trip, timed, for the health probe. Null when unreachable, so a probe
   * can report status instead of throwing.
   */
  async latency(): Promise<number | null> {
    if (!this.driver) {
      return null;
    }
    const startedAt = Date.now();
    try {
      await this.driver.verifyConnectivity();
      return Date.now() - startedAt;
    } catch {
      return null;
    }
  }
}

function isConnectivityError(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? "";
  return (
    code.startsWith("ServiceUnavailable") || code.startsWith("SessionExpired")
  );
}

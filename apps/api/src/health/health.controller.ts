import { Public } from "@aec-craft/platform-id-resource-nestjs";
import { DatabaseToken } from "@aec-craft/platform-tenancy-api/nest";
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { type SQL, sql } from "drizzle-orm";

/** The ping surface readiness needs; the directory drizzle db satisfies it. */
interface Pingable {
  execute(query: SQL): Promise<unknown>;
}

/**
 * Liveness + readiness probes — host-owned: which dependency gates traffic is
 * a deployable decision, not a domain package's. Readiness pings the platform
 * database through the directory connection (the shared core every request
 * path touches via the access pipeline).
 *
 *   GET /health  — process is alive (always 200)
 *   GET /ready   — process is ready to serve (204, or 503 if a dep is down)
 *
 * Split intentionally: a slow/unreachable DB should pull the pod from the
 * load balancer (readiness fails) without restarting it (liveness still
 * passes), so the pod recovers as soon as the dep recovers.
 */
@ApiTags("Health")
@Controller()
export class HealthController {
  constructor(@Inject(DatabaseToken) private readonly db: Pingable) {}

  @Get("health")
  @Public()
  @ApiOperation({
    summary: "Liveness probe",
    description:
      "**Public.** Returns `ok` as long as the service is running. Safe to use as an orchestrator's liveness check — it never fails because of downstream issues, so a failed call means the process itself needs to be restarted.",
  })
  @ApiOkResponse({
    description: "Service is alive.",
    schema: {
      type: "object",
      properties: { status: { type: "string", enum: ["ok"] } },
      required: ["status"],
      example: { status: "ok" },
    },
  })
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Readiness probe",
    description:
      "**Public.** Returns success when the service can serve traffic (database reachable), or a 503 when it can't. Use this as a load balancer's readiness check — a failure pulls the instance out of rotation without restarting it.",
  })
  @ApiNoContentResponse({ description: "Ready to serve traffic." })
  @ApiServiceUnavailableResponse({
    description: "A dependency (the platform database) is unreachable.",
  })
  async readiness(): Promise<void> {
    try {
      await this.db.execute(sql`SELECT 1`);
    } catch (err) {
      throw new ServiceUnavailableException("Database not reachable", {
        cause: err instanceof Error ? err : undefined,
      });
    }
  }
}

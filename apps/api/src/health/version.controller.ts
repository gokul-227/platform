import { Public } from "@aec-craft/platform-id-resource-nestjs";
import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

interface VersionInfo {
  buildTime: string | null;
  commit: string | null;
  nodeVersion: string;
  version: string;
}

/**
 * Build/runtime metadata. Values are read from env at request time so the
 * deployable can stamp them at build (`SERVICE_VERSION`, `SERVICE_COMMIT`,
 * `SERVICE_BUILD_TIME`). Useful for confirming which build is live from a
 * single curl.
 */
@ApiTags("Version")
@Controller()
export class VersionController {
  @Get("version")
  @Public()
  @ApiOperation({
    summary: "Build metadata",
    description:
      "**Public.** Returns the running build's version, commit hash, build time, and Node.js runtime version. Useful for confirming which release is currently deployed.",
  })
  @ApiOkResponse({
    description: "The running build's identity.",
    schema: {
      type: "object",
      properties: {
        version: { type: "string", example: "1.4.2" },
        commit: { type: "string", nullable: true, example: "c46ddc6" },
        buildTime: {
          type: "string",
          nullable: true,
          example: "2026-07-24T12:00:00Z",
        },
        nodeVersion: { type: "string", example: "v24.4.1" },
      },
      required: ["version", "commit", "buildTime", "nodeVersion"],
    },
  })
  version(): VersionInfo {
    return {
      version: process.env.SERVICE_VERSION ?? "dev",
      commit: process.env.SERVICE_COMMIT ?? null,
      buildTime: process.env.SERVICE_BUILD_TIME ?? null,
      nodeVersion: process.version,
    };
  }
}

import { setMetadataInputSchema } from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

/**
 * Body DTO for `PUT …/metadata/:keyPath`. Shared across the user, org, and
 * project metadata submodules — the KV write surface is identical per scope.
 */
export class SetMetadataDto extends createZodDto(setMetadataInputSchema) {}

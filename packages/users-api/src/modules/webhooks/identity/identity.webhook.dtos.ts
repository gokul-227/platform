import { upsertIdentityInputSchema } from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class UpsertIdentityDto extends createZodDto(
  upsertIdentityInputSchema
) {}

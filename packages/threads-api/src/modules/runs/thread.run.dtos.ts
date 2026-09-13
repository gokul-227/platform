import {
  createThreadRunInputSchema,
  submitThreadRunInputSchema,
  threadRunListInputSchema,
  threadRunListResponseSchema,
  threadRunResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class CreateThreadRunDto extends createZodDto(
  createThreadRunInputSchema
) {}

export class SubmitThreadRunDto extends createZodDto(
  submitThreadRunInputSchema
) {}

export class ListThreadRunsDto extends createZodDto(threadRunListInputSchema) {}

export class ThreadRunListResponseDto extends createZodDto(
  threadRunListResponseSchema
) {}

export class ThreadRunResponseDto extends createZodDto(
  threadRunResponseSchema
) {}

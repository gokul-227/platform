import {
  createThreadInputSchema,
  threadListInputSchema,
  threadListResponseSchema,
  threadResponseSchema,
  updateThreadInputSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class CreateThreadDto extends createZodDto(createThreadInputSchema) {}

export class ListThreadsDto extends createZodDto(threadListInputSchema) {}

export class ThreadListResponseDto extends createZodDto(
  threadListResponseSchema
) {}

export class ThreadResponseDto extends createZodDto(threadResponseSchema) {}

export class UpdateThreadDto extends createZodDto(updateThreadInputSchema) {}

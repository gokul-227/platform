import {
  createThreadMessageInputSchema,
  threadMessageListInputSchema,
  threadMessageListResponseSchema,
  threadMessageResponseSchema,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class CreateThreadMessageDto extends createZodDto(
  createThreadMessageInputSchema
) {}

export class ListThreadMessagesDto extends createZodDto(
  threadMessageListInputSchema
) {}

export class ThreadMessageListResponseDto extends createZodDto(
  threadMessageListResponseSchema
) {}

export class ThreadMessageResponseDto extends createZodDto(
  threadMessageResponseSchema
) {}

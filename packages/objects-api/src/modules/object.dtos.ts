import {
  getGraphNodeQuerySchema,
  graphNodeListResponseSchema,
  graphNodeListShape,
  graphNodeResponseSchema,
  scopeQueryRefinement,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class GetObjectQueryDto extends createZodDto(getGraphNodeQuerySchema) {}

/**
 * `type` is omitted because this resource sets it, and `.strict()` makes that a
 * refusal rather than a silence: zod strips an unknown key by default, so
 * `?type=object` would look accepted and do nothing. A filter that lies is worse
 * than one that is not offered.
 *
 * The scope refinement is the node list's own: exactly one of `orgId` or
 * `projectId`, because a read of neither is unscoped and a read of both is two
 * questions.
 */
export class ListObjectsDto extends createZodDto(
  graphNodeListShape
    .omit({ type: true })
    .strict()
    .superRefine(scopeQueryRefinement)
) {}

export class ObjectResponseDto extends createZodDto(graphNodeResponseSchema) {}

export class ObjectListResponseDto extends createZodDto(
  graphNodeListResponseSchema
) {}

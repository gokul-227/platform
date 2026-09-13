import {
  getGraphNodeQuerySchema,
  graphNodeListResponseSchema,
  graphNodeListShape,
  graphNodeResponseSchema,
  scopeQueryRefinement,
} from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";

export class GetRuleQueryDto extends createZodDto(getGraphNodeQuerySchema) {}

/**
 * `type` is omitted because this resource sets it, and `.strict()` makes that a
 * refusal rather than a silence: zod strips an unknown key by default, so
 * `?type=rule` would look accepted and do nothing. A filter that lies is worse
 * than one that is not offered.
 *
 * The scope refinement is the node list's own: exactly one of `orgId` or
 * `projectId`. An organisation's rules are the case this exists for — design
 * intent held once and hydrated into every project.
 */
export class ListRulesDto extends createZodDto(
  graphNodeListShape
    .omit({ type: true })
    .strict()
    .superRefine(scopeQueryRefinement)
) {}

export class RuleResponseDto extends createZodDto(graphNodeResponseSchema) {}

export class RuleListResponseDto extends createZodDto(
  graphNodeListResponseSchema
) {}

import { applyDecorators } from "@nestjs/common";
import { ApiParam } from "@nestjs/swagger";

/**
 * The platform's whole path-parameter vocabulary: `<noun>Id`, plus `keyPath`.
 * Held in one table because the same parameter appears on dozens of routes and
 * a per-route description drifts; a new parameter shape belongs here first.
 */
const PATH_PARAMS = {
  edgeId: { format: "uuid", description: "The graph edge's id." },
  eventId: { format: "uuid", description: "The audit event's id." },
  externalId: {
    description: "The identity provider's own id for the person.",
  },
  fileId: { format: "uuid", description: "The file or folder's id." },
  groupId: { format: "uuid", description: "The group's id." },
  keyPath: {
    description:
      "Dotted path into the metadata bag, e.g. `apps.platform.theme`.",
  },
  nodeId: { format: "uuid", description: "The graph node's id." },
  objectId: { format: "uuid", description: "The object's id." },
  orgId: { format: "uuid", description: "The organization's id." },
  projectId: { format: "uuid", description: "The project's id." },
  ruleId: { format: "uuid", description: "The rule's id." },
  runId: { format: "uuid", description: "The run's id." },
  subjectId: {
    description: "The member's identity subject, as their token asserts it.",
  },
  threadId: { format: "uuid", description: "The thread's id." },
  userId: { format: "uuid", description: "The person's platform user id." },
} as const;

export type PathParamName = keyof typeof PATH_PARAMS;

/**
 * Documents a route's path parameters. Pass them in the order the path has
 * them; every one is required, because a path parameter cannot be otherwise.
 *
 *   @Get(":fileId/metadata/:keyPath")
 *   @ApiPathParams("fileId", "keyPath")
 */
export const ApiPathParams = (
  ...names: PathParamName[]
): ClassDecorator & MethodDecorator =>
  applyDecorators(
    ...names.map((name) =>
      ApiParam({ name, required: true, ...PATH_PARAMS[name] })
    )
  );

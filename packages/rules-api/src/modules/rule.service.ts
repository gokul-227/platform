import {
  GraphNodeService,
  GraphNodeTypeService,
} from "@aec-craft/platform-graph-api/nest";
import { Inject, Injectable } from "@nestjs/common";
import { RuleErrors } from "./rule.errors";

/** The rule half of `graph_node`: what a project must satisfy. */
@Injectable()
export class RuleService extends GraphNodeTypeService {
  protected readonly nodeType = "rule";
  protected readonly notFound = RuleErrors.NOT_FOUND;

  constructor(@Inject(GraphNodeService) nodes: GraphNodeService) {
    super(nodes);
  }
}

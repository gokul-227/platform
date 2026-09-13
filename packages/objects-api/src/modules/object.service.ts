import {
  GraphNodeService,
  GraphNodeTypeService,
} from "@aec-craft/platform-graph-api/nest";
import { Inject, Injectable } from "@nestjs/common";
import { ObjectErrors } from "./object.errors";

/** The building half of `graph_node`: sites, storeys, spaces and elements. */
@Injectable()
export class ObjectService extends GraphNodeTypeService {
  protected readonly nodeType = "object";
  protected readonly notFound = ObjectErrors.NOT_FOUND;

  constructor(@Inject(GraphNodeService) nodes: GraphNodeService) {
    super(nodes);
  }
}

import type { ApiDocumentSpec } from "@aec-craft/platform-common/nest";

import { ObjectsApiModule } from "../config/api.module";
import { ObjectModule } from "../modules/object.module";

export const objectsApiDocument: ApiDocumentSpec = {
  include: [ObjectsApiModule, ObjectModule],
  path: "openapi-objects",
  sourceTitle: "Objects",
  title: "Objects API",
  tags: [
    {
      name: "Objects",
      description:
        "The building: sites, storeys, spaces and the elements that enclose and divide them. Read a scope with `?orgId=` or `?projectId=`; a project read hydrates the parent org's shared library and `?scope=project` narrows to the project's own. Every read is a read of `graph_node` narrowed to `type: object` before the query runs, so no rule or source can appear here whatever a caller passes, and the filter, sort, cursor and `?select=` grammar is the graph node list's own.",
    },
  ],
};

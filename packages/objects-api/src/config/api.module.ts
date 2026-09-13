import { Module } from "@nestjs/common";

import { ObjectModule } from "../modules/object.module";

/**
 * Nothing to configure: this package owns no tables. It reads the object half of
 * `graph_node` through the graph slice, so `GraphApiModule` must be registered.
 */
@Module({
  imports: [ObjectModule],
  exports: [ObjectModule],
})
export class ObjectsApiModule {}

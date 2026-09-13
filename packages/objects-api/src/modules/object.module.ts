import { Module } from "@nestjs/common";

import { ObjectCollectionController } from "./object.controller";
import { ObjectService } from "./object.service";

@Module({
  controllers: [ObjectCollectionController],
  providers: [ObjectService],
  exports: [ObjectService],
})
export class ObjectModule {}

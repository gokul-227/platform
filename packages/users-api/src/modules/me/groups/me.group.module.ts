import { Module } from "@nestjs/common";

import { MeGroupController } from "./me.group.controller";

/** The caller's own standings, read from the authorization kernel. */
@Module({
  controllers: [MeGroupController],
})
export class MeGroupModule {}

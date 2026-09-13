import { ProjectionSessionService } from "@aec-craft/platform-graph-client";
import { Inject, Injectable } from "@nestjs/common";
import type { AnalysisScope } from "../analysis.scope";
import { assertCypherScoped } from "./scope.cypher";
import type { Row } from "./sql.cell";

export interface CypherStatement {
  cypher: string;
  params?: Record<string, unknown>;
}

/** Cypher an analysis wrote, run against the projection, scoped. */
@Injectable()
export class CypherQueryService {
  constructor(
    @Inject(ProjectionSessionService)
    private readonly session: ProjectionSessionService
  ) {}

  get isAvailable(): boolean {
    return this.session.isAvailable;
  }

  async run(scope: AnalysisScope, statement: CypherStatement): Promise<Row[]> {
    assertCypherScoped(statement.cypher);
    const records = await this.session.read({
      params: {
        ...(statement.params ?? {}),
        groups: [...scope.readableGroups],
        projectId: scope.projectId,
      },
      text: statement.cypher,
    });
    return records.map((record) => record.toObject() as Row);
  }
}

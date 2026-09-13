import { allMapped, createRelation } from "../synthesize";
import type { IfcInstance, IfcSourceContainment } from "../types";

/**
 * Turn parent-child pairs into mappable relation instances.
 *
 * A reader hands over containment as flat pairs rather than as the two IFC
 * relationships, because it has already resolved which is which and the
 * distinction does not survive into the graph anyway. One `IfcRelAggregates`
 * per parent carries all its children, which is how IFC would have written it.
 */
export function synthesizeContainment(
  containments: readonly IfcSourceContainment[],
  context: { mapped: ReadonlySet<string> }
): IfcInstance[] {
  const childrenByParent = new Map<string, string[]>();

  for (const pair of containments) {
    if (!allMapped(context.mapped, pair.parentGuid, pair.childGuid)) {
      continue;
    }
    const children = childrenByParent.get(pair.parentGuid);
    if (children) {
      children.push(pair.childGuid);
    } else {
      childrenByParent.set(pair.parentGuid, [pair.childGuid]);
    }
  }

  return [...childrenByParent].map(([parentGuid, childGuids]) =>
    createRelation("IfcRelAggregates", `containment:${parentGuid}`, {
      RelatingObject: parentGuid,
      RelatedObjects: childGuids,
    })
  );
}

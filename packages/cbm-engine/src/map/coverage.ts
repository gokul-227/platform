import type { SourceTypeRef } from "./source";
import type { EntityMapping, FieldRule, MappingTable } from "./table";

export interface CoverageDenominators {
  /** The mappable type universe. */
  entities: SourceTypeRef[];
  /** Types that are not mappable at all (resource, geometry, measure). Shown
   *  for honesty about the size of the format, never counted against. */
  na: number;
  /** The standard property universe, as `Set.property` addresses. */
  properties: string[];
}

export interface CoverageBucket {
  mapped: number;
  total: number;
}

export interface CoverageReport {
  entities: {
    byMechanism: Record<string, number>;
    bySourceType: Record<string, CoverageBucket>;
    mapped: number;
    /** Types in the denominator that no entry claims. */
    missing: string[];
    na: number;
    total: number;
  };
  format: string;
  properties: {
    mapped: number;
    missing: string[];
    total: number;
  };
  /** Class roots and block keys at least one rule feeds. */
  schemaFed: string[];
  version: string;
}

/** Types some entry turns into something. An `ignored` entry is a decision,
 *  not coverage, so it does not count as mapped. */
function claimedTypes(table: MappingTable): Set<string> {
  const claimed = new Set<string>();
  for (const entry of table.entries) {
    if (entry.target.as !== "ignored") {
      claimed.add(entry.source);
    }
  }
  return claimed;
}

/** Every source property address any rule reads. */
function readProperties(table: MappingTable): Set<string> {
  const read = new Set<string>();
  const collect = (rules: FieldRule[] | undefined): void => {
    for (const rule of rules ?? []) {
      if (rule.from.includes(".")) {
        read.add(rule.from);
      }
    }
  };
  for (const entry of table.entries) {
    collect(entry.fields);
  }
  collect(table.propertyRules);
  return read;
}

const rootOf = (path: string): string => path.split(".")[0] ?? path;

/** The class roots and block keys this table writes into. */
function schemaFed(table: MappingTable): string[] {
  const fed = new Set<string>();
  for (const entry of table.entries) {
    if (entry.target.as === "node" && entry.target.class) {
      fed.add(rootOf(entry.target.class));
    } else if (entry.target.as === "edge") {
      fed.add(`edge:${entry.target.type}`);
    }
    for (const rule of entry.fields ?? []) {
      if (rule.to.includes(".")) {
        fed.add(rootOf(rule.to));
      }
    }
  }
  for (const rule of table.propertyRules ?? []) {
    if (rule.to.includes(".")) {
      fed.add(rootOf(rule.to));
    }
  }
  return [...fed].sort();
}

function countByMechanism(entries: EntityMapping[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.target.as === "ignored") {
      continue;
    }
    const key = entry.mechanism ?? "unattributed";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Measure a table against a format's own denominators.
 *
 * Two axes, kept apart because they answer different questions and, on real
 * files, give very different answers: how much of the type universe we claim,
 * and how much of the standard property universe we read.
 */
export function coverage(
  table: MappingTable,
  denominators: CoverageDenominators
): CoverageReport {
  const claimed = claimedTypes(table);
  const bySourceType: Record<string, CoverageBucket> = {};
  const missingEntities: string[] = [];
  let entitiesMapped = 0;

  for (const ref of denominators.entities) {
    let bucket = bySourceType[ref.sourceType];
    if (!bucket) {
      bucket = { mapped: 0, total: 0 };
      bySourceType[ref.sourceType] = bucket;
    }
    bucket.total += 1;
    if (claimed.has(ref.source)) {
      bucket.mapped += 1;
      entitiesMapped += 1;
    } else {
      missingEntities.push(ref.source);
    }
  }

  const read = readProperties(table);
  const missingProperties: string[] = [];
  let propertiesMapped = 0;
  for (const property of denominators.properties) {
    if (read.has(property)) {
      propertiesMapped += 1;
    } else {
      missingProperties.push(property);
    }
  }

  return {
    format: table.format,
    version: table.version,
    entities: {
      byMechanism: countByMechanism(table.entries),
      bySourceType,
      mapped: entitiesMapped,
      missing: missingEntities,
      na: denominators.na,
      total: denominators.entities.length,
    },
    properties: {
      mapped: propertiesMapped,
      missing: missingProperties,
      total: denominators.properties.length,
    },
    schemaFed: schemaFed(table),
  };
}

const percent = (part: number, whole: number): number =>
  whole ? Math.round((part / whole) * 100) : 0;

/** Render a report as markdown, for the CLI and the generated README lines. */
export function formatCoverage(report: CoverageReport): string {
  const { entities, properties } = report;
  const lines = [
    `# ${report.format} ${report.version} standard coverage`,
    "",
    `Entities:   ${entities.mapped} / ${entities.total} mappable mapped (${percent(entities.mapped, entities.total)}%)   [+${entities.na} N/A resource/geometry]`,
    `Properties: ${properties.mapped} / ${properties.total} standard properties mapped (${percent(properties.mapped, properties.total)}%)`,
    "",
    "| mechanism | entries |",
    "| --- | --- |",
  ];
  for (const [mechanism, count] of Object.entries(
    entities.byMechanism
  ).sort()) {
    lines.push(`| ${mechanism} | ${count} |`);
  }
  lines.push("", "| source type | mapped | total |", "| --- | --- | --- |");
  for (const [type, bucket] of Object.entries(entities.bySourceType).sort()) {
    lines.push(`| ${type} | ${bucket.mapped} | ${bucket.total} |`);
  }
  lines.push("", `Schema fed: ${report.schemaFed.join(", ")}`);
  return lines.join("\n");
}

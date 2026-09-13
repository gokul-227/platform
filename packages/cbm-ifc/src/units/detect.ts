import type { IfcUnitFactors } from "./factors";

const SI_PREFIX: Record<string, number> = {
  CENTI: 1e-2,
  DECA: 1e1,
  DECI: 1e-1,
  HECTO: 1e2,
  KILO: 1e3,
  MILLI: 1e-3,
};

const ASSIGNMENT = /IFCUNITASSIGNMENT\s*\(\s*\(([^)]*)\)/;
const MEASURE_VALUE = /IFC[A-Z]*MEASURE\s*\(\s*([0-9.eE+-]+)\s*\)/;
const TRAILING_REF = /#\d+\s*\)?\s*$/;
const NOT_A_REF = /[^#\d]/g;

type Measure = keyof IfcUnitFactors;

const MEASURE_MARKER: Record<string, Measure> = {
  ".AREAUNIT.": "area",
  ".LENGTHUNIT.": "length",
  ".VOLUMEUNIT.": "volume",
};

/** The arguments of one STEP entity, by line id. */
function argumentsOf(text: string, id: string, entity: string): string | null {
  const match = new RegExp(
    `${id}\\s*=\\s*${entity}\\s*\\(([^;]*)\\)\\s*;`
  ).exec(text);
  return match?.[1] ?? null;
}

function prefixFactor(args: string): number {
  for (const [prefix, factor] of Object.entries(SI_PREFIX)) {
    if (args.includes(`.${prefix}.`)) {
      return factor;
    }
  }
  return 1;
}

function measureOf(args: string): Measure | null {
  for (const [marker, measure] of Object.entries(MEASURE_MARKER)) {
    if (args.includes(marker)) {
      return measure;
    }
  }
  return null;
}

/**
 * Read the file's unit assignment.
 *
 * Returns null when the file states none. The adapter then writes no measured
 * value at all: applying the wrong factor turns a 4 m room into a 4 km one and
 * nothing downstream can tell, so a hole is the only honest answer.
 */
export function detectUnits(text: string): IfcUnitFactors | null {
  const assignment = ASSIGNMENT.exec(text);
  if (!assignment?.[1]) {
    return null;
  }

  const factors: IfcUnitFactors = { area: 1, length: 1, volume: 1 };

  for (const rawId of assignment[1].split(",")) {
    const id = rawId.trim();
    if (!id.startsWith("#")) {
      continue;
    }

    const si = argumentsOf(text, id, "IFCSIUNIT");
    if (si) {
      const measure = measureOf(si);
      if (measure) {
        factors[measure] = prefixFactor(si);
      }
      continue;
    }

    // Imperial and other conversion-based units state their factor to the
    // underlying SI unit in a separate entity, e.g. FOOT to 0.3048.
    const conversion = argumentsOf(text, id, "IFCCONVERSIONBASEDUNIT");
    if (!conversion) {
      continue;
    }
    const measure = measureOf(conversion);
    const reference = TRAILING_REF.exec(conversion)?.[0]
      ?.trim()
      .replace(NOT_A_REF, "");
    if (!(measure && reference)) {
      continue;
    }
    const withUnit = argumentsOf(text, reference, "IFCMEASUREWITHUNIT");
    const raw = withUnit ? MEASURE_VALUE.exec(withUnit)?.[1] : null;
    if (!raw) {
      continue;
    }
    const factor = Number.parseFloat(raw);
    if (Number.isFinite(factor) && factor > 0) {
      factors[measure] = factor;
    }
  }

  return factors;
}

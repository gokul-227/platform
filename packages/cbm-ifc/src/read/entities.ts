import WEBIFC from "web-ifc";

import type {
  IfcSource,
  IfcSourceContainment,
  IfcSourceElement,
} from "../types";

/**
 * Spatial types, named rather than detected. The kernel's `IsIfcElement`
 * answers false for these (a storey is not a physical element), but they are
 * exactly what a building model is organised by.
 */
const SPATIAL = new Set([
  "IFCBUILDING",
  "IFCBUILDINGSTOREY",
  "IFCEXTERNALSPATIALELEMENT",
  "IFCSITE",
  "IFCSPACE",
  "IFCSPATIALELEMENT",
  "IFCSPATIALSTRUCTUREELEMENT",
  "IFCSPATIALZONE",
]);

/**
 * Attributes that are structure rather than data. Placements and shape
 * representations are how the file is built, not anything about the building.
 */
const STRUCTURAL = new Set([
  "ObjectPlacement",
  "OwnerHistory",
  "Representation",
  "RepresentationMaps",
  "Tag",
  "expressID",
  "type",
]);

/**
 * Reads one open model into neutral source elements.
 *
 * A class rather than a family of functions because the kernel handle and the
 * model id are needed by every step, and threading them through each call is
 * what made this read as a pile of helpers. Constructed per read, used once.
 */
export class IfcEntityReader {
  private readonly psets = new Map<number, Bags>();
  private readonly quantities = new Map<number, Bags>();
  private readonly guidByExpressId = new Map<number, string>();

  constructor(
    private readonly api: WEBIFC.IfcAPI,
    private readonly modelId: number
  ) {}

  /**
   * Everything the mapping needs from the file.
   *
   * Property sets first, because an element carries the sets that name it and
   * the relation table is the only place that association lives.
   */
  read(): IfcSource {
    this.readPropertySets();
    const elements = this.readElements();
    return { elements, containments: this.readContainments() };
  }

  // ── entities ───────────────────────────────────────────────────────────────

  /**
   * Every entity worth materialising.
   *
   * Driven by the types actually present in the file, so the several hundred
   * resource and geometry entities of a real model are never built at all.
   * Unmapped-but-real types *are* built, so they surface as drift rather than
   * vanishing: that is how a gap like `IfcFlowTerminal` becomes visible.
   */
  private readElements(): IfcSourceElement[] {
    const elements: IfcSourceElement[] = [];

    for (const typeCode of this.api.GetIfcEntityList(this.modelId)) {
      const name = this.api.GetNameFromTypeCode(typeCode).toUpperCase();
      if (!this.isWanted(typeCode, name)) {
        continue;
      }
      const ids = this.api.GetLineIDsWithType(this.modelId, typeCode);
      for (let index = 0; index < ids.size(); index += 1) {
        const expressId = ids.get(index);
        const line = this.line(expressId);
        const guid = line ? unwrap(line.GlobalId) : undefined;
        if (!(line && typeof guid === "string" && guid.length > 0)) {
          continue;
        }
        this.guidByExpressId.set(expressId, guid);
        elements.push({
          attributes: attributesOf(line),
          category: name,
          guid,
          expressId,
          psets: this.psets.get(expressId) ?? {},
          quantities: this.quantities.get(expressId) ?? {},
        });
      }
    }
    return elements;
  }

  /**
   * Physical elements and spatial containers, never relationships.
   *
   * Relationships are read by the mechanisms that own them, from the STEP text,
   * because the kernel does not expose everything they need.
   */
  private isWanted(typeCode: number, name: string): boolean {
    if (name.startsWith("IFCREL")) {
      return false;
    }
    return SPATIAL.has(name) || this.api.IsIfcElement(typeCode);
  }

  // ── property and quantity sets ─────────────────────────────────────────────

  /**
   * Every set in the file, in one pass over the relation table.
   *
   * Not by asking the kernel's helper per element: it re-walks the relations
   * for each element it is asked about, which turns a linear read into a
   * quadratic one on a model of any size.
   */
  private readPropertySets(): void {
    const relations = this.api.GetLineIDsWithType(
      this.modelId,
      WEBIFC.IFCRELDEFINESBYPROPERTIES
    );

    for (let index = 0; index < relations.size(); index += 1) {
      const relation = this.line(relations.get(index));
      const definition = this.referenced(relation?.RelatingPropertyDefinition);
      const setName = definition ? unwrap(definition.Name) : undefined;
      if (!(definition && typeof setName === "string" && setName.length > 0)) {
        continue;
      }

      const isQuantitySet = definition.Quantities !== undefined;
      const entries = this.entriesOf(
        isQuantitySet ? definition.Quantities : definition.HasProperties
      );
      if (Object.keys(entries).length === 0) {
        continue;
      }

      const into = isQuantitySet ? this.quantities : this.psets;
      for (const expressId of refIds(relation?.RelatedObjects)) {
        const bags = into.get(expressId) ?? {};
        bags[setName] = { ...bags[setName], ...entries };
        into.set(expressId, bags);
      }
    }
  }

  /**
   * One name and one value per entry.
   *
   * `IfcPropertySingleValue` and the whole `IfcQuantity*` family reduce to
   * that. Enumerated, bounded and list properties carry no single value and
   * are skipped rather than flattened into something a rule would misread.
   */
  private entriesOf(refs: unknown): Record<string, unknown> {
    const entries: Record<string, unknown> = {};
    for (const expressId of refIds(refs)) {
      const line = this.line(expressId);
      const name = line ? unwrap(line.Name) : undefined;
      if (!(line && typeof name === "string" && name.length > 0)) {
        continue;
      }
      const value =
        unwrap(line.NominalValue) ??
        unwrap(line.AreaValue) ??
        unwrap(line.VolumeValue) ??
        unwrap(line.LengthValue) ??
        unwrap(line.CountValue) ??
        unwrap(line.WeightValue) ??
        unwrap(line.TimeValue);
      if (value !== undefined) {
        entries[name] = value;
      }
    }
    return entries;
  }

  // ── containment ────────────────────────────────────────────────────────────

  /**
   * Parent-child pairs by GlobalId, from both relationships that express
   * containment. Resolved here so nothing downstream deals in express ids.
   */
  private readContainments(): IfcSourceContainment[] {
    return [
      ...this.pairs(
        WEBIFC.IFCRELAGGREGATES,
        "RelatingObject",
        "RelatedObjects"
      ),
      ...this.pairs(
        WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
        "RelatingStructure",
        "RelatedElements"
      ),
    ];
  }

  private pairs(
    typeCode: number,
    parentKey: string,
    childKey: string
  ): IfcSourceContainment[] {
    const found: IfcSourceContainment[] = [];
    const ids = this.api.GetLineIDsWithType(this.modelId, typeCode);

    for (let index = 0; index < ids.size(); index += 1) {
      const relation = this.line(ids.get(index));
      const parentRef = relation?.[parentKey] as { value?: number } | undefined;
      const parentGuid =
        typeof parentRef?.value === "number"
          ? this.guidByExpressId.get(parentRef.value)
          : undefined;
      if (!parentGuid) {
        continue;
      }
      for (const childId of refIds(relation?.[childKey])) {
        const childGuid = this.guidByExpressId.get(childId);
        if (childGuid && childGuid !== parentGuid) {
          found.push({ childGuid, parentGuid });
        }
      }
    }
    return found;
  }

  // ── kernel access ──────────────────────────────────────────────────────────

  /** One line, or null if the kernel refuses it. */
  private line(expressId: number): Record<string, unknown> | null {
    try {
      return this.api.GetLine(this.modelId, expressId) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  }

  /** The line a single reference points at. */
  private referenced(ref: unknown): Record<string, unknown> | null {
    const expressId = (ref as { value?: number } | undefined)?.value;
    return typeof expressId === "number" ? this.line(expressId) : null;
  }
}

type Bags = Record<string, Record<string, unknown>>;

/** Express ids out of a reference list, skipping anything malformed. */
function refIds(refs: unknown): number[] {
  if (!Array.isArray(refs)) {
    return [];
  }
  const ids: number[] = [];
  for (const ref of refs) {
    const value = (ref as { value?: number })?.value;
    if (typeof value === "number") {
      ids.push(value);
    }
  }
  return ids;
}

/**
 * Unwrap the kernel's boxed values.
 *
 * Everything arrives as `{ type, value }`, a select or enumeration nests one
 * level further, and a set arrives as an array. Anything still an object after
 * unwrapping is a reference to another entity, which is addressed by GlobalId
 * everywhere downstream, so it is dropped rather than carried as a handle.
 */
function unwrap(raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    return;
  }
  if (Array.isArray(raw)) {
    const items = raw.map(unwrap).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (typeof raw !== "object") {
    return raw;
  }
  const boxed = raw as { value?: unknown };
  return "value" in boxed ? unwrap(boxed.value) : undefined;
}

function attributesOf(line: Record<string, unknown>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(line)) {
    if (STRUCTURAL.has(key)) {
      continue;
    }
    const value = unwrap(raw);
    if (value !== undefined) {
      attributes[key] = value;
    }
  }
  return attributes;
}

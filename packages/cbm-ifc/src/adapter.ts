import type {
  EndpointRule,
  SourceAdapter,
} from "@aec-craft/platform-cbm-engine";

import { IFC_FORMAT } from "./format";
import type { IfcInstance, IfcModel } from "./types";

function asIdList(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/**
 * Read a mapping address off an instance.
 *
 * A bare name is an attribute. A dotted name is a set and a property, and the
 * `Qto` prefix is what says which bag to look in. That convention is the whole
 * addressing scheme, and it is why a mapping rule can be one line of data.
 */
function readAddress(instance: IfcInstance, address: string): unknown {
  const dot = address.indexOf(".");
  if (dot === -1) {
    return instance.attributes[address];
  }
  const set = address.slice(0, dot);
  const property = address.slice(dot + 1);
  return set.startsWith("Qto")
    ? instance.quantities[set]?.[property]
    : instance.psets[set]?.[property];
}

/**
 * The IFC plug into the engine.
 *
 * Its one real job beyond addressing is unit conversion: the mapping table
 * declares the canonical unit it wants and this applies the file's own
 * factors, so no rule anywhere has to know that a particular export wrote
 * millimetres.
 *
 * Fails closed. A measured value whose unit cannot be established is not
 * written at all, because there is no safe guess: assuming SI stores a 4000 mm
 * wall as a 4 km one, and nothing downstream can tell.
 */
export function createIfcAdapter(model: IfcModel): SourceAdapter<IfcInstance> {
  const factors = model.unitFactors;
  const factorFor: Record<string, number | undefined> = {
    m: factors?.length,
    m2: factors?.area,
    m3: factors?.volume,
  };

  return {
    format: IFC_FORMAT,
    resolve: (instance, address, unit) => {
      const value = readAddress(instance, address);
      if (!unit) {
        return value;
      }
      if (typeof value !== "number") {
        return value;
      }
      const factor = factorFor[unit];
      return factor === undefined ? undefined : value * factor;
    },
    endpoints: (instance, rule: EndpointRule) => ({
      from: asIdList(instance.attributes[rule.from]),
      to: asIdList(instance.attributes[rule.to]),
    }),
  };
}

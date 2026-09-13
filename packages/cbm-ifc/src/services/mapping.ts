import type { EntityMapping } from "@aec-craft/platform-cbm-engine";

import { node } from "../targets";

const MECHANISM = "services";

/** Distribution: what moves air, water, power and signal through a building. */
const PAIRS = [
  ["IfcDuctSegment", "element.duct.segment"],
  ["IfcDuctFitting", "element.duct.fitting"],
  ["IfcPipeSegment", "element.pipe.segment"],
  ["IfcPipeFitting", "element.pipe.fitting"],
  ["IfcCableSegment", "element.cable.segment"],
  ["IfcCableCarrierSegment", "element.cableCarrier.segment"],
  ["IfcAirTerminal", "element.airTerminal"],
  ["IfcAirTerminalBox", "element.airTerminalBox"],
  ["IfcPump", "element.pump"],
  ["IfcFan", "element.fan"],
  ["IfcBoiler", "element.boiler"],
  ["IfcChiller", "element.chiller"],
  ["IfcCoil", "element.coil"],
  ["IfcValve", "element.valve"],
  ["IfcSanitaryTerminal", "element.sanitaryTerminal"],
  ["IfcLightFixture", "element.lightFixture"],
  ["IfcOutlet", "element.outlet"],
  ["IfcSwitchingDevice", "element.switch"],
  ["IfcSensor", "element.sensor"],
  ["IfcActuator", "element.actuator"],
  ["IfcSpaceHeater", "element.spaceHeater"],
  ["IfcTank", "element.tank"],
] as const;

export const SERVICES_ENTITIES: EntityMapping[] = [
  ...PAIRS.map(
    ([source, cls]): EntityMapping => ({
      source,
      sourceType: "element",
      mechanism: MECHANISM,
      status: "stub",
      target: node(cls),
      fields: [{ from: "Name", to: "name" }],
    })
  ),
  {
    /**
     * The one relationship in this folder. A system serving a building is the
     * only MEP relationship IFC states plainly; everything else about how a
     * network connects is in ports and connections, which are not mapped.
     */
    source: "IfcRelServicesBuildings",
    sourceType: "relation",
    mechanism: MECHANISM,
    status: "partial",
    target: {
      as: "edge",
      type: "serves",
      endpoints: { from: "RelatingSystem", to: "RelatedBuildings" },
    },
  },
];

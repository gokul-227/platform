# Services

**IFC calls these** distribution elements. **We call them** `element.*`, plus
the `serves` edge.

## Why this exists

MEP is a large share of the element types in the schema and almost none of the
value so far. This folder exists to hold that honestly: the elements are
admitted so they are in the graph, and the folder says plainly that they are
stubs.

## What it does

One node per distribution element, marked `stub`: identity and a name. Plus one
edge, `serves`, from `IfcRelServicesBuildings`.

## IFC types here

Twenty-two element types across four networks, plus one relationship:

| Network | Types |
| --- | --- |
| air | `IfcDuctSegment`, `IfcDuctFitting`, `IfcAirTerminal`, `IfcAirTerminalBox`, `IfcFan`, `IfcCoil` |
| water | `IfcPipeSegment`, `IfcPipeFitting`, `IfcPump`, `IfcValve`, `IfcTank`, `IfcSanitaryTerminal` |
| power and signal | `IfcCableSegment`, `IfcCableCarrierSegment`, `IfcOutlet`, `IfcSwitchingDevice`, `IfcLightFixture`, `IfcSensor`, `IfcActuator` |
| plant | `IfcBoiler`, `IfcChiller`, `IfcSpaceHeater` |

| IFC | | Ours |
| --- | --- | --- |
| `IfcRelServicesBuildings` | → | `serves` edge, system to building |

## What it deliberately does not do

**Network connectivity.** IFC models how a duct connects to the next one
through ports and `IfcRelConnectsPortToElement`. None of that is mapped, so the
graph knows a duct segment exists and not what it is joined to. Following a
network end to end is not possible yet, and that is the largest single gap in
this package.

**Anything about performance.** No flow rates, no capacities, no pressures.

## The known gap

`IfcFlowTerminal` is not mapped. It is the abstract supertype some exporters
emit instead of a concrete terminal, so a file using it loses every terminal at
once. Worth closing before the concrete types are deepened.

## Coverage

23 entries, 22 of them stubs. The stub count is the point: this folder has
breadth and no depth, and pretending otherwise would make the coverage number
lie.

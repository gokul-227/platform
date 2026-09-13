/** How to turn this file's numbers into SI. */
export interface IfcUnitFactors {
  /** Multiply a source area by this to get square metres. */
  area: number;
  /** Multiply a source length by this to get metres. */
  length: number;
  /** Multiply a source volume by this to get cubic metres. */
  volume: number;
}

/** SI, which is what a file with no usable assignment is assumed to be. */
export const SI: IfcUnitFactors = { area: 1, length: 1, volume: 1 };

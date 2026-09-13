/**
 * Shared property-bag projection for the node and edge response mappers. A
 * non-empty `projection` narrows the returned `properties` to the requested
 * keys (missing keys come back as `null`); `propertyKeys` always reflects the
 * full stored bag so callers can tell which keys exist regardless of projection.
 */
export function projectProperties(
  properties: Record<string, unknown>,
  projection?: string[]
): { properties: Record<string, unknown>; propertyKeys: string[] } {
  const propertyKeys = Object.keys(properties);
  if (projection !== undefined && projection.length > 0) {
    return {
      properties: Object.fromEntries(
        projection.map((k) => [k, properties[k] ?? null])
      ),
      propertyKeys,
    };
  }
  return { properties, propertyKeys };
}

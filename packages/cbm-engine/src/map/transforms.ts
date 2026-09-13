/**
 * Named value transforms, referenced from a rule by id rather than inlined as
 * a function, so the table stays data and each transform is testable alone.
 */
export type FieldTransform = (value: unknown) => unknown;
export type TransformRegistry = Record<string, FieldTransform>;

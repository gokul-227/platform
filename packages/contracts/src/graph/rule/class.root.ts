/**
 * Class roots for the rule type.
 *
 * `rule` replaces `requirement` in the canonical list. Rows written under the
 * old value keep it and classify as drift; nothing rejects them. See the Status
 * section of docs/cognitive-building-model.md.
 */
export const RULE_CLASS_ROOTS = [
  {
    value: "rule",
    nodeType: "rule",
    description: "A normative or project rule.",
  },
] as const;

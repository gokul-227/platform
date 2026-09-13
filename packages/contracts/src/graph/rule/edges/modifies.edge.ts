import { defineEdge } from "../../registry/edge";

/**
 * A rule about rules: a permitted deviation or an exemption that changes how
 * another rule applies. LBO BW § 56 (2) and BauGB § 34 (5) are both this shape.
 *
 * An edge rather than a list on the modifying rule, because the count is small
 * and the traversal is the point: "every deviation that touches § 34" is the
 * question that gets asked.
 */
export const modifiesEdge = defineEdge({
  value: "modifies",
  description:
    "A rule alters how another rule applies: a permitted deviation, an exemption, or a severity change.",
  from: ["rule"],
  to: ["rule"],
  cardinality: "manyToMany",
  symmetric: false,
  transitive: false,
  origin: { type: "asserted" },
});

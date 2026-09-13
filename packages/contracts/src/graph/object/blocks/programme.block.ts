import { z } from "zod";
import { defineBlock } from "../../registry/block";

/**
 * Programme block: use and occupancy. `access` is private | shared | public.
 *
 * `PROGRAMME_USES` is advisory and open, the same bar as `CANONICAL_CLASSES`:
 * a novel use succeeds and is counted as drift. It exists because a free string
 * meant an importer wrote `CORRIDOR` while a rule selected `circulation`, so
 * every use predicate missed and every such rule evaluated to `skip`. An
 * importer maps its own source vocabulary onto this list and keeps the
 * untranslated value in `interop.sourceClass`, so nothing is lost and rules
 * have one target to aim at.
 *
 * `use` is where a space's current use lives, and the only place: never in the
 * `class` leaf. The two have different lifetimes. `class` is the durable
 * typological kind that survives a change of use, and re-rooting it is rejected;
 * `use` is what a Nutzungsänderung changes, which is itself a regulated event, so
 * it has to be an ordinary property write. Rule selectors read either.
 */
/**
 * Well-known values for `use`, grouped by the regime that regulates them. Not
 * an enum: the field stays a string and an unlisted value is drift, not an
 * error.
 *
 * Two tiers, and the distinction matters: a room's use and a building's use are
 * different vocabularies. No room has the use `hospital`, and no building has
 * the use `corridor`. A classifying rule reads the building tier; a dimensional
 * rule almost always reads the room tier.
 */
export const PROGRAMME_USES = [
  // residential
  "dwelling",
  "living",
  "sleeping",
  "kitchen",
  "teaKitchen",
  // sanitary and service
  "sanitary",
  "wc",
  "bathroom",
  "cleaning",
  "waste",
  "storage",
  "technical",
  // work and public
  "office",
  "meeting",
  "reception",
  "waiting",
  "retail",
  "gastronomy",
  "assembly",
  "education",
  "sport",
  // care
  "treatment",
  "care",
  "ward",
  // circulation and parking
  "circulation",
  "stair",
  "lobby",
  "parking",
  // outside the enclosure
  "outdoor",
  "roof",
  // Building-level uses. A room's use and a building's use are different
  // vocabularies: a hospital contains treatment rooms and corridors, and no
  // room has the use "hospital". The list below is close to LBO BW § 38 (2),
  // which is the statute's own enumeration of the building uses that carry a
  // different regime, so it doubles as the vocabulary a classifying rule
  // matches on.
  "hospital",
  "clinic",
  "school",
  "university",
  "kindergarten",
  "careHome",
  "hotel",
  "prison",
  "campsite",
  "amusementPark",
  "arcade",
  "assemblyVenue",
  "sportsVenue",
  "shoppingCentre",
  "officeBuilding",
  "industrial",
  "agricultural",
  "highRise",
] as const;

export type ProgrammeUse = (typeof PROGRAMME_USES)[number];

export const programmeSchema = z
  .object({
    /** The current use. Canonical values in `PROGRAMME_USES`; open. */
    use: z.string().optional(),
    access: z.string().optional(),
    /** What happens in the space, which may be several things at once. */
    activities: z.array(z.string()).optional(),
    /**
     * Egress role, as flags here rather than a block of its own: they qualify
     * how a space is used, which is what this block is for. One declared
     * spelling matters more than the shape, because a formalisation pass
     * otherwise invents a different one per paragraph.
     */
    isEgressRoute: z.boolean().nullish(),
    /** `corridor` | `stair` | `exit` | `lobby`. */
    egressRole: z.string().nullish(),
    /** Required as a second, independent escape route. */
    isSecondEgressRoute: z.boolean().nullish(),
    occupancyTypical: z.number().int().min(0).optional(),
    occupancyMax: z.number().int().min(0).optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

export type Programme = z.infer<typeof programmeSchema>;

export const programmeBlock = defineBlock({
  key: "programme",
  description:
    "Function and occupancy: current use, activities, access, occupant counts.",
  schema: programmeSchema,
});

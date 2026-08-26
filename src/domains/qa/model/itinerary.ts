import data from "./itinerary.json";
import type { ItineraryMeta, Phase } from "./qaMark";

/**
 * The itinerary, as `npm run qa:build` parsed it from
 * `docs/qa/itinerary.md`, with the ledger's retirement and edit history
 * folded in.
 *
 * The markdown is the source; this is generated. Ids are permanent and never
 * reused — the build refuses a deletion and refuses a reused id, so a verdict
 * recorded against a check always describes the thing that was verified.
 */
const parsed = data as unknown as { meta: ItineraryMeta; phases: Phase[] };

export const itinerary = parsed.phases;
export const itineraryMeta = parsed.meta;

import data from "./itinerary.json";
import type { Phase } from "./qaMark";

/**
 * The itinerary, as `npm run qa:build` parsed it from
 * `docs/qa/itinerary.md`.
 *
 * The markdown is the source; this is generated, and the artifact is generated
 * from the same parse. Three places the checks appear, one place they are
 * written (Q14).
 */
export const itinerary = data as unknown as Phase[];

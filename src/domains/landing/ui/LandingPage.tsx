import { Closing } from "./Closing";
import { Coach } from "./Coach";
import { Faq } from "./Faq";
import { FinalCta } from "./FinalCta";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Pricing } from "./Pricing";
import { Ticker } from "./Ticker";

/**
 * The landing page composition — section order is the pitch:
 * hook → proof → process → who → price → objections → belief → ask.
 *
 * Eight sections, in the order of Audrey's Figma ("Final design", 2026-08-15).
 * The order changed with the redesign: the wireframe answered objections and
 * then showed a sample review, where this puts the FAQ late and closes on the
 * emotional band instead. Reordering these is a marketing decision, and this is
 * where it's made.
 *
 * The bands alternate ground deliberately — dark, blue, light, dark, blue,
 * light, dark. No two adjacent sections share a background, which is what keeps
 * a page this long from reading as one undifferentiated column.
 */
export function LandingPage() {
  return (
    <>
      <Hero />
      <Ticker />
      <HowItWorks />
      <Coach />
      <Pricing />
      <Faq />
      <Closing />
      <FinalCta />
    </>
  );
}

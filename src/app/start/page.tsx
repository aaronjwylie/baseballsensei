import type { Metadata } from "next";
import Image from "next/image";
import { ButtonLink, Container, SectionHeading } from "@/shared/ui";
import { site } from "@/shared/config/site";
import { resolveFlowState } from "@/domains/checkout";
import { CheckoutFlow } from "@/domains/checkout";

export const metadata: Metadata = {
  alternates: { canonical: "/start" },
  title: "Get coach feedback",
  description:
    "Tell us about the player, verify your email, upload your clips, and check out.",
};

/**
 * Sentences for the one thing that can go wrong outside the flow's own control:
 * coming back from a redirect payment that we then couldn't confirm.
 */
const PAYMENT_NOTICE: Record<string, string> = {
  failed:
    "We couldn't confirm that payment. If you were charged, email us and we'll sort it out. Please don't pay again.",
  missing: "That payment didn't come back with a reference. Please try again.",
};

/**
 * The whole customer flow, on one route, on the dark ground Audrey's design
 * gives it.
 *
 * **Always starts at step 1.** There is no resume: `resolveFlowState` reads no
 * cookie and returns only the operator's limits and which upload path this
 * environment supports. A refresh, a re-opened tab, or a shared machine all get
 * a clean form.
 *
 * `?paid=1` is the exception, and it isn't a resume — it's where
 * `/api/payment/return` sends a customer after a redirect payment it has already
 * confirmed and cleared the cookie for. It renders a standalone confirmation
 * that reads no state at all.
 *
 * The header floats over this page (see `SiteChrome`), so the top padding has to
 * clear its 79px itself.
 *
 * Dynamic because `resolveFlowState` reads the operator's limits from the
 * database, not because of any session. The price is not shown here: the design
 * does not put one on this page, and the pay step quotes it where it matters.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; paid?: string }>;
}) {
  const [state, params] = await Promise.all([
    resolveFlowState(),
    searchParams,
  ]);

  const ground = (
    <>
      <Image
        src="/images/form-ground.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-ink/85" />
    </>
  );

  if (params.paid === "1") {
    return (
      <section className="relative isolate grow overflow-hidden bg-ink">
        {ground}
        <Container className="relative max-w-xl pb-24 pt-[140px] text-center lg:pt-[170px]">
          <div
            aria-hidden
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-highlight text-2xl text-accent"
          >
            ✓
          </div>
          <h1 className="mt-6 font-display text-[32px] font-medium uppercase tracking-[-0.02em] text-highlight lg:text-[40px]">
            Payment received
          </h1>
          <p className="mt-4 text-[15px] leading-[1.5] text-paper">
            Your submission is in and paid for. A receipt is on its way to your
            inbox, listing everything you sent.
          </p>
          <p className="mt-2 text-[15px] leading-[1.5] text-paper">
            A coach will send a personal video walkthrough — we&rsquo;ll email you
            the moment it&rsquo;s ready.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <ButtonLink href="/status" variant="onDark">
              Check your status
            </ButtonLink>
            <ButtonLink href="/start" variant="primary">
              Send another
            </ButtonLink>
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section className="relative grow bg-ink">
      {/*
        The photographic ground is clipped and stacked inside its own wrapper,
        NOT on the <section>. The section is an ancestor of the Focus <select>,
        and Chrome on macOS mispositions a native select's popup when an ancestor
        establishes a containing/stacking context — `overflow-hidden` and
        `isolate` here floated the dropdown far from its control (QA 2.1.5). Held
        to the background layer, they leave the select's ancestor chain clean and
        the popup anchors correctly, while the ground looks identical: the wrapper
        covers the section exactly.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 isolate overflow-hidden"
      >
        {ground}
      </div>

      <Container className="relative pb-24 pt-[140px] lg:pb-28 lg:pt-[170px]">
        <SectionHeading
          as="h1"
          tone="onDark"
          align="center"
          title={{ lead: "Get coach", highlight: "feedback" }}
        />
        <p className="mx-auto mt-5 max-w-[540px] text-center text-[15px] leading-[1.5] text-paper">
          Show us what you&rsquo;re working on. Send videos, photos, or notes and
          get personalized feedback from a professional baseball coach within{" "}
          {site.turnaround}.
        </p>

        <div className="mx-auto mt-14 max-w-[520px]">
          <CheckoutFlow
            uploadMode={state.uploadMode}
            maxFileSizeMb={state.maxFileSizeMb}
            maxFiles={state.maxFiles}
            paymentNotice={
              params.payment ? PAYMENT_NOTICE[params.payment] : undefined
            }
          />
        </div>
      </Container>
    </section>
  );
}

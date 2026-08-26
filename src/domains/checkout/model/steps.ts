/**
 * The four steps between "I want feedback" and "you've been charged".
 *
 * The order **is** the product decision, and this is where it's made — the
 * indicator, the flow's state machine, and the resume logic all read it, so
 * adding or reordering a step is one edit rather than four.
 *
 * Why this order: verification sits second because everything after it depends
 * on us being able to reach the customer, and finding out the address was wrong
 * *after* taking money is the one failure they can't fix themselves. Payment
 * sits last so nobody pays for a submission whose upload then fails
 * (ADR 009).
 *
 * Client-safe: no server imports.
 */

export const CHECKOUT_STEPS = [
  { key: "details", label: "Player details" },
  { key: "verify", label: "Verify email" },
  { key: "upload", label: "Upload files" },
  { key: "pay", label: "Payment" },
] as const;

export type CheckoutStep = (typeof CHECKOUT_STEPS)[number]["key"];

/**
 * The four steps, plus the state after them.
 *
 * `done` is not a step — it has no indicator position and nothing follows it —
 * but it *is* somewhere the flow can be resumed into, which is why it belongs
 * in this union rather than as a boolean elsewhere. A customer who paid via
 * 3-D Secure comes back to a fresh page load and must land here.
 */
export type FlowStep = CheckoutStep | "done";

export const TOTAL_STEPS = CHECKOUT_STEPS.length;

/** 1-based position, for "Step 2 of 4". */
export function stepNumber(step: CheckoutStep): number {
  return CHECKOUT_STEPS.findIndex((s) => s.key === step) + 1;
}

export function stepLabel(step: CheckoutStep): string {
  return CHECKOUT_STEPS.find((s) => s.key === step)?.label ?? "";
}

/**
 * What each step says for itself, from Audrey's Figma.
 *
 * **Her design is one page with three numbered blocks; this flow is four
 * steps**, and the two do not line up. She drew *About you*, *Show your coach*
 * and *Tell us more*; the live flow collects her first and third block together
 * in step 1 (the notes field sits in the same form as the player's details),
 * then verifies an email, then uploads, then charges. So her STEP 02 becomes
 * our 03, her STEP 03 is folded into our 01, and **verify and pay have no
 * design at all** — their copy is authored in her voice and marked below.
 *
 * The renumbering is the honest option: a flow that shows "Step 03" third and
 * "Step 02" fourth would be faithful to a document and wrong for the person
 * reading it.
 *
 * `body` is a function because the upload step quotes the operator's own file
 * limit, which lives in `settings` and is not knowable here.
 */
export const STEP_COPY: Record<
  CheckoutStep,
  { eyebrow: string; title: string; body: (ctx: { maxFiles: number }) => string }
> = {
  details: {
    eyebrow: "Step 01 — About you",
    title: "Tell us about the player.",
    body: () =>
      "A few details help your coach understand who they're working with.",
  },
  verify: {
    eyebrow: "Step 02 — Check your email",
    title: "Confirm we can reach you.",
    /*
      AUTHORED — the design has no verification step. Written to say why the
      interruption exists, because a code request with no stated reason reads as
      an obstacle: the feedback is delivered by email, so an address we can't
      reach means a review nobody receives.
    */
    body: () =>
      "We've sent you a 6-digit code. Enter it below so your coach's feedback lands somewhere you'll actually see it.",
  },
  upload: {
    eyebrow: "Step 03 — Show your coach",
    title: "What would you like help with?",
    body: ({ maxFiles }) =>
      `Upload up to ${maxFiles} files that help your coach understand what you're working on. Videos are best for hitting and pitching mechanics, but you can also include photos or supporting documents.`,
  },
  pay: {
    eyebrow: "Step 04 — Checkout",
    title: "Last step.",
    /*
      AUTHORED — the design has no payment step. It leads with the files being
      safe because that is this flow's one genuinely reassuring fact at the
      moment somebody is asked for a card: nothing was charged until the upload
      had already succeeded (ADR 009).
    */
    body: () =>
      "Your files are in and your email is confirmed. Pay once and your coach gets to work — there's no subscription and nothing recurring.",
  },
};

import { STEP_COPY, type CheckoutStep } from "../model/steps";

/**
 * The heading above each step's panel — a blue pill, a lime title, a line of
 * explanation.
 *
 * The design stacks all three of its blocks on one page, so its pills read as
 * section markers. Here only one is on screen at a time, which makes the pill
 * do more work: it is the only place the step is named rather than numbered,
 * and it sits beside the progress bar that says how far along it is.
 *
 * No server imports, so it can render inside the client-side flow.
 */
export function StepHeading({
  step,
  maxFiles,
}: {
  step: CheckoutStep;
  maxFiles: number;
}) {
  const copy = STEP_COPY[step];

  return (
    <div className="text-center">
      <p className="inline-block bg-accent px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-paper">
        {copy.eyebrow}
      </p>

      <h2 className="mt-5 font-display text-[22px] font-medium uppercase leading-[1.1] tracking-[-0.01em] text-highlight lg:text-[26px]">
        {copy.title}
      </h2>

      <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-[1.5] text-paper">
        {copy.body({ maxFiles })}
      </p>
    </div>
  );
}

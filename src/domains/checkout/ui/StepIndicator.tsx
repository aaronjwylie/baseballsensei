"use client";

import {
  CHECKOUT_STEPS,
  TOTAL_STEPS,
  stepNumber,
  type CheckoutStep,
} from "../model/steps";

/**
 * "Step 2 of 4", with the road behind and ahead.
 *
 * Worth the space: the flow now asks for a code and a set of files before it
 * asks for money, and a customer who can't see how much is left reads the extra
 * steps as the process going wrong rather than as three short steps.
 *
 * **Completed steps are buttons, not decoration.** A customer who spots a typo
 * in their email at step 3, or wants one more clip while looking at the payment
 * form, can go straight back. Only backwards — a step you haven't reached isn't
 * a link, because skipping the gate is exactly what the flow exists to prevent.
 * The parent decides what's reachable via `canGoTo`; this only draws it.
 *
 * The full labels are hidden below `sm` — on a phone the counter and the current
 * step's name carry the same information without wrapping to three lines.
 *
 * **Authored, not designed.** Audrey's feedback design is a single page with
 * every block visible at once, so it needs no progress at all. This flow shows
 * one step at a time and would otherwise give no sense of how much is left,
 * which is exactly how three short steps start reading as an endless form. The
 * colours follow the flow's dark ground: lime for ground covered, a dim white
 * for what is ahead.
 */
export function StepIndicator({
  current,
  canGoTo,
  onGoTo,
}: {
  current: CheckoutStep;
  canGoTo?: (step: CheckoutStep) => boolean;
  onGoTo?: (step: CheckoutStep) => void;
}) {
  const currentNumber = stepNumber(current);

  return (
    <div>
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-band">
        {`Step ${currentNumber} of ${TOTAL_STEPS}`}
      </p>

      <ol className="mt-3 flex gap-2" aria-label="Progress">
        {CHECKOUT_STEPS.map((step, index) => {
          const position = index + 1;
          const done = position < currentNumber;
          const active = position === currentNumber;
          const reachable = done && !!onGoTo && (canGoTo?.(step.key) ?? true);

          const bar = (
            <div
              className={`h-1.5 transition-colors ${
                done || active ? "bg-highlight" : "bg-paper/25"
              } ${reachable ? "group-hover:bg-paper" : ""}`}
            />
          );
          const label = (
            <span
              className={`mt-2 hidden text-xs sm:block ${
                active ? "font-semibold text-paper" : "text-band"
              } ${reachable ? "group-hover:text-paper group-hover:underline" : ""}`}
            >
              {step.label}
            </span>
          );

          return (
            <li
              key={step.key}
              className="flex-1"
              aria-current={active ? "step" : undefined}
            >
              {reachable ? (
                <button
                  type="button"
                  onClick={() => onGoTo?.(step.key)}
                  className="group block w-full cursor-pointer text-left"
                >
                  <span className="sr-only">Go back to </span>
                  {bar}
                  {label}
                </button>
              ) : (
                <>
                  {bar}
                  {label}
                </>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-2 text-center text-sm font-semibold text-paper sm:hidden">
        {CHECKOUT_STEPS[currentNumber - 1]?.label}
      </p>
    </div>
  );
}

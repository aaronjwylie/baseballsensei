"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/shared/ui";
import { PlayerInfoForm } from "@/domains/submission/ui/PlayerInfoForm";
import type {
  SubmissionInput,
  SubmissionInputDraft,
} from "@/domains/submission/model/submissionInput";
import { VerifyPanel } from "@/domains/verification/ui/VerifyPanel";
import { UploadPanel } from "@/domains/upload/ui/UploadPanel";
import type {
  UploadMode,
  UploadedFile,
} from "@/shared/upload";
import { PaymentPanel } from "@/domains/payment/ui/PaymentPanel";
import type { CreatedIntent } from "@/domains/payment/api/paymentApi";
import {
  checkDeliveryAction,
  confirmPaymentAction,
  createIntentAction,
  listFlowFilesAction,
  removeFlowFileAction,
  resendCodeAction,
  startAnotherAction,
  startSubmissionAction,
  verifyCodeAction,
} from "../api/checkoutActions";
import type { CheckoutStep, FlowStep } from "../model/steps";
import { stepNumber } from "../model/steps";
import { StepIndicator } from "./StepIndicator";
import { StepHeading } from "./StepHeading";

/*
  How long step 1 holds before it lets the customer forward.

  Resend accepting the code isn't delivery: a mistyped address bounces by webhook
  about two seconds after the send. Rather than flash the customer onto step 2 and
  yank them back when that lands, we wait the bounce out here — the submit button
  still reads "Sending your code…", which is the distractor — and only advance
  once nothing has bounced. Sized just past the measured ~2s bounce; a bounce
  slower than this still gets VerifyPanel's second, later look on step 2, which
  now keeps the typed details rather than scrubbing them (QA 2.1.9).
*/
const DELIVERY_HOLD_MS = 3000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The four-step path from "I want feedback" to "you've been charged".
 *
 * **One route, four steps.** The steps don't get their own URLs, for the reason
 * ADR 005 gave when there were two of them: a full page navigation between
 * "your details" and "pay" reintroduces exactly the seam Elements was chosen to
 * remove, and the client secret would have to travel through a URL to survive
 * it.
 *
 * **The state is entirely client-side, and dies with the page.** There is no
 * resume — a refresh, a re-opened tab, or a shared machine always begins at step
 * 1. That is deliberate: only a completed payment earns retention, so a
 * half-finished submission is a scratch pad, and resuming one dropped customers
 * into somebody's abandoned attempt.
 *
 * The flow cookie still exists, but it is a *capability*, not a memory: the
 * server uses it to answer "which submission may this request touch" when
 * verifying a code or accepting an upload. Nothing reads it to decide which step
 * to show. The 3-D Secure return trip — the one case that used to need resuming
 * — lands on `/start?paid=1` instead, a standalone confirmation that reads no
 * state at all.
 *
 * This component owns the sequence and nothing else. Each step's panel belongs
 * to the domain that owns its subject.
 */
export function CheckoutFlow({
  uploadMode,
  maxFileSizeMb,
  maxFiles,
  paymentNotice,
}: {
  uploadMode: UploadMode;
  maxFileSizeMb: number;
  maxFiles: number;
  /** Set when the redirect return trip couldn't be confirmed. */
  paymentNotice?: string;
}) {
  const [step, setStep] = useState<FlowStep>("details");
  const [email, setEmail] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [intent, setIntent] = useState<CreatedIntent | null>(null);
  const [error, setError] = useState<string | null>(paymentNotice ?? null);
  /*
    Held in client state because nothing is resumed from the server: a page load
    always starts at step 1, so these only ever describe the attempt happening
    right now. `folder` arrives with step 1's result — it can't exist before the
    submission does.
  */
  const [details, setDetails] = useState<Partial<SubmissionInputDraft> | undefined>(
    undefined,
  );
  const [folder, setFolder] = useState("");

  if (step === "done") {
    return (
      <Confirmation
        playerName={playerName}
        fileCount={files.length}
        onStartAnother={startOver}
      />
    );
  }

  /*
    Abandon the current attempt and return to a clean step 1. The state lives
    only in React (a page load always starts fresh), so `router.refresh()` did
    NOT reset it — a soft refresh keeps client state, so "Start over" cleared the
    cookie but left the customer stranded on the same step. Resetting the state
    here is what actually takes them back.
  */
  async function startOver() {
    await startAnotherAction();
    resetToStepOne(null);
  }

  /** Clear every trace of the attempt and show step 1, with an optional note. */
  function resetToStepOne(note: string | null) {
    setStep("details");
    setEmail("");
    setPlayerName("");
    setFiles([]);
    setIntent(null);
    setDetails(undefined);
    setFolder("");
    setError(note);
  }

  /*
    The one failure that isn't an error message.

    Every action answers `{ ok: false, error }`, and rendering that string where
    the customer stands is right for "that code was wrong" — they fix it and
    carry on. It is wrong for "that submission no longer exists": the window
    lapsed, the server scrubbed the scratch pad, and nothing on this screen will
    ever work again. Left as an inline error, a customer sits on step 3 uploading
    into a submission that was deleted ten minutes ago.

    So `gone` is a flag rather than a sentence, and this is the only thing that
    reads it: put them back at step 1 holding the explanation. Returns true when
    it handled the result, so callers read as `if (handledGone(result)) return`.

    `keepDetails` is the second axis. A bounced code is `gone` too — it can't be
    verified from here — but the submission's details are fine, so we return to
    step 1 with everything they typed intact and let them fix just the address. A
    true scrub has no details worth keeping, so it wipes. `startOver` clears
    unconditionally on its own path (`resetToStepOne`), so it's unaffected.
  */
  function handledGone(result: {
    ok: false;
    error: string;
    gone?: true;
    keepDetails?: true;
  }): boolean {
    if (!result.gone) return false;
    if (result.keepDetails) {
      setStep("details");
      setError(result.error);
    } else {
      resetToStepOne(result.error);
    }
    return true;
  }

  async function submitDetails(values: SubmissionInput) {
    setError(null);
    const result = await startSubmissionAction(values);
    if (!result.ok) {
      if (!handledGone(result)) setError(result.error);
      return;
    }
    setEmail(result.data.email);
    setFolder(result.data.uploadFolder);
    setPlayerName(values.playerName);
    // Remember what they typed, so stepping back shows it again.
    setDetails({
      customerEmail: values.customerEmail,
      playerName: values.playerName,
      playerAge: values.playerAge ? String(values.playerAge) : "",
      focus: values.focus ?? "",
      customerNotes: values.customerNotes ?? "",
    });

    /*
      Hold on step 1 until the code has actually landed. The submit button stays
      in its pending state through this wait (onSubmit is awaited), so the
      customer sees "Sending your code…" rather than a step-2 flash. A bounce here
      keeps everything they typed and holds them on step 1 to fix the address; a
      clean window advances them (QA 2.1.9).
    */
    await wait(DELIVERY_HOLD_MS);
    const delivery = await checkDeliveryAction();
    if (!delivery.ok) {
      if (!handledGone(delivery)) setError(delivery.error);
      return;
    }
    setStep("verify");
  }

  async function submitCode(
    code: string,
  ): Promise<{ error: string; locked?: boolean } | null> {
    const result = await verifyCodeAction(code);
    if (!result.ok) {
      // A scrubbed submission can't be fixed by retyping the code, so this one
      // leaves the panel entirely rather than showing an inline hint.
      if (handledGone(result)) return null;
      // `locked` (out of guesses) stays on step 2 but retires the input; a plain
      // error keeps it live for another try.
      return { error: result.error, locked: result.locked };
    }

    // Files may already exist if they got this far before and came back.
    const existing = await listFlowFilesAction();
    if (existing.ok) setFiles(existing.data);

    setStep("upload");
    return null;
  }

  /*
    One look, a few seconds in, for a bounce.

    The customer is on step 2 staring at a code input; a bounce arrives about two
    seconds after the send and nothing can push it to them. Without this they sit
    there until they give up and click something, and only then learn the address
    was wrong.

    It can only ever move them backwards, so it says nothing unless it's certain.
  */
  async function checkDelivery(): Promise<void> {
    const result = await checkDeliveryAction();
    if (!result.ok) handledGone(result);
  }

  async function resend(): Promise<string | null> {
    const result = await resendCodeAction();
    if (result.ok) return null;
    if (handledGone(result)) return null;
    return result.error;
  }

  async function toPayment() {
    setError(null);
    const current = await listFlowFilesAction();
    if (current.ok) setFiles(current.data);

    const result = await createIntentAction();
    if (!result.ok) {
      if (!handledGone(result)) setError(result.error);
      return;
    }
    setIntent(result.data);
    setStep("pay");
  }

  async function onPaid(paymentIntentId: string) {
    const result = await confirmPaymentAction(paymentIntentId);
    if (!result.ok) {
      if (!handledGone(result)) setError(result.error);
      return;
    }
    setStep("done");
  }

  /*
    Which completed steps a customer may jump back to.

    `verify` is excluded once the email is proven: there is nothing to edit
    there and no code in hand, so sending someone back to it would be a dead
    end. Changing the email is done by going back to `details`, which clears the
    verification and re-sends a code — handled server-side in
    `updateDraftDetails`, so the two can't disagree.
  */
  function canGoTo(target: CheckoutStep): boolean {
    if (stepNumber(target) >= stepNumber(step as CheckoutStep)) return false;
    return target !== "verify";
  }

  function goTo(target: CheckoutStep) {
    if (!canGoTo(target)) return;
    setError(null);
    setStep(target);
  }

  return (
    <div className="space-y-8 [--field-error:var(--color-highlight)] [--field-hint:var(--color-band)] [--field-label:var(--color-paper)]">
      <StepIndicator current={step} canGoTo={canGoTo} onGoTo={goTo} />

      <StepHeading step={step} maxFiles={maxFiles} />

      {/* The verify panel shows its own errors inline, next to the input. */}
      {error && step !== "verify" && (
        <p
          role="alert"
          className="border-2 border-highlight px-4 py-3 text-center text-sm text-paper"
        >
          {error}
        </p>
      )}

      {step === "details" && (
        <PlayerInfoForm
          defaultValues={details}
          submitLabel="Continue to email verification"
          pendingLabel="Sending your code…"
          onSubmit={submitDetails}
        />
      )}

      {step === "verify" && (
        <VerifyPanel
          email={email}
          onVerify={submitCode}
          onResend={resend}
          onCheckDelivery={checkDelivery}
          onBack={() => setStep("details")}
        />
      )}

      {step === "upload" && (
        <UploadPanel
          mode={uploadMode}
          folder={folder}
          maxFileSizeMb={maxFileSizeMb}
          maxFiles={maxFiles}
          initialFiles={files}
          onRemoveFile={removeFlowFileAction}
          onDone={toPayment}
        />
      )}

      {/*
        An explicit way out. Refreshing already starts over, but it also loses
        any uploaded files silently; this makes abandoning deliberate, and lets a
        customer on a shared machine hand the browser back knowing the server has
        let go of their submission rather than waiting out the idle window.
      */}
      {step !== "details" && (
        <p className="text-center text-sm text-band">
          <button
            type="button"
            onClick={startOver}
            className="underline hover:text-paper"
          >
            Start over
          </button>
        </p>
      )}

      {step === "pay" && intent && (
        <PaymentPanel
          intent={intent}
          playerName={playerName}
          fileCount={files.length}
          onPaid={onPaid}
          onBack={() => setStep("upload")}
        />
      )}
    </div>
  );
}

/** The end of the flow — what was sent, and what happens next. */
function Confirmation({
  playerName,
  fileCount,
  onStartAnother,
}: {
  playerName: string;
  fileCount: number;
  onStartAnother: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="text-center">
      <div
        aria-hidden
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-highlight text-2xl text-accent"
      >
        ✓
      </div>
      <h2 className="mt-6 font-display text-[26px] font-medium uppercase tracking-[-0.01em] text-highlight">
        You&rsquo;re all set
      </h2>
      <p className="mt-4 text-paper">
        We&rsquo;ve got {fileCount} file{fileCount === 1 ? "" : "s"} for{" "}
        {playerName} and your payment went through. A receipt is on its way to
        your inbox.
      </p>
      <p className="mt-2 text-paper">
        A coach will send a personal video walkthrough — we&rsquo;ll email you
        the moment it&rsquo;s ready.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onStartAnother();
            setBusy(false);
          }}
        >
          {busy ? "Starting…" : "Send another video"}
        </Button>
        <ButtonLink href="/status" variant="primary">
          Check your status
        </ButtonLink>
      </div>
    </div>
  );
}

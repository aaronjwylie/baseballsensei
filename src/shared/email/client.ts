/**
 * Transactional email transport (Resend REST API).
 *
 * Sending is **best-effort**: every send is wrapped so a failure logs but never
 * throws into a webhook handler or a portal action. Stripe retries on any non-2xx,
 * so a throwing send would turn a degraded email provider into a retry storm
 * against a payment that already succeeded. See ADR 004.
 *
 * The `from` address is `EMAIL_FROM` (the verified Resend domain in prod), set
 * once in env — callers never pass it.
 *
 * If RESEND_API_KEY is unset, sends are skipped with a log line — absent reads
 * as absent (principle #10), never a fake success.
 */
import { env } from "@/shared/config/env";

export interface EmailMessage {
  /**
   * One recipient or several. Passed to Resend as-is — its `to` accepts a
   * string or an array, and an array is the *only* correct shape for more than
   * one: joining addresses into `"a@x.com, b@y.com"` makes Resend read the whole
   * string as one malformed address and reject the send (422). Every admin note
   * goes to more than one address, so this must stay an array end to end.
   */
  to: string | string[];
  subject: string;
  html: string;
  /**
   * Where a reply should go, when that is not us.
   *
   * Every message this app sends is *from* the brand, so `from` stays
   * `EMAIL_FROM` and callers never touch it. The contact form is the one case
   * where the person who should receive a reply is not the person who sent the
   * mail: the operator gets it, and hitting reply has to reach the customer who
   * wrote in, not the app's own outbox.
   */
  replyTo?: string;
}

/**
 * Send one message. **Never throws** (ADR 004) — but it does report.
 *
 * "Best-effort" was only ever about not failing a webhook or a portal action
 * because a mail server hiccuped. It was never meant to make delivery
 * *unknowable*: most callers should ignore the result, and the one whose
 * customer is **blocked** on the message must be able to say so.
 *
 * Returns `ok: false` when the key is unset, the API refused, or the network
 * failed — i.e. "this did not reach Resend". `ok: true` means **accepted for
 * delivery**, which is the strongest thing a sender can claim at this moment.
 *
 * `id` is Resend's message id, and it's what makes the rest knowable: the
 * delivery webhook arrives seconds later carrying the same id, so without
 * keeping it here there is no way to tie "this bounced" back to a submission.
 */
/**
 * What a send reports back.
 *
 * `ok` is "Resend accepted it", not "the customer has it" — those are different
 * claims and the gap between them is where a mistyped address lives. `id` is how
 * the second claim becomes knowable later.
 */
export interface SendResult {
  ok: boolean;
  id?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: EmailMessage): Promise<SendResult> {
  const apiKey = env.resendApiKey;
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY unset — skipping email to ${to}: ${subject}`,
    );
    // A Playwright run has no mail provider, and the flow is *blocked* on the
    // verification send — so report success there (the code is a fixed constant
    // the test already knows). Never true in a deployed environment, where an
    // absent key must read as an absent send, not a fake one.
    return { ok: env.isE2E };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to,
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error(`[email] Resend ${res.status}: ${await res.text()}`);
      return { ok: false };
    }
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id };
  } catch (err) {
    console.error("[email] send failed:", err);
    return { ok: false };
  }
}

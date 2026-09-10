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
   * Recipients nobody else can see.
   *
   * **The only safe way to mail a group that a customer is also in.** Put four
   * admins in `to` and any one of them can expose all four by hitting reply-all
   * on a thread the customer is part of. Their addresses are ours to protect,
   * and "remember not to reply-all" is not a mechanism (Ben, 2026-09-09).
   */
  bcc?: string | string[];
  /**
   * Where a reply should go, when that is not us.
   *
   * Every message this app sends is *from* the brand, so `from` stays
   * `EMAIL_FROM` and callers never touch it.
   *
   * **An array continues a thread on both sides at once.** A contact message
   * has two parties who must stay in it — the customer who wrote and the shared
   * inbox that archives it — so one Reply has to reach both. A single address
   * would force the admin to remember the other one every time.
   */
  replyTo?: string | string[];
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
  /**
   * Why it didn't reach Resend, when it didn't. Recorded on the trail beside the
   * `failed` outcome, so a failure explains itself there rather than only in the
   * server logs, which expire — four past `② arrival → Admin` failures became
   * undiagnosable exactly because the reason lived only in Vercel's logs
   * (QA 2.5.5).
   */
  error?: string;
}

export async function sendEmail({
  to,
  bcc,
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
    return env.isE2E ? { ok: true } : { ok: false, error: "RESEND_API_KEY unset" };
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
        ...(bcc && bcc.length ? { bcc } : {}),
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`[email] Resend ${res.status}: ${detail}`);
      // Prefer Resend's own message over its JSON envelope; keep it short enough
      // to sit comfortably in a trail note.
      let message = detail;
      try {
        message = (JSON.parse(detail) as { message?: string })?.message ?? detail;
      } catch {}
      return { ok: false, error: `Resend ${res.status}: ${message}`.slice(0, 500) };
    }
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id };
  } catch (err) {
    console.error("[email] send failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

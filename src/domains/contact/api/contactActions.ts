"use server";

import { contactInputSchema, HONEYPOT_FIELD } from "../model/contactInput";
import { sendContactMessage } from "./contactEmail";

export type ContactResult = { ok: true } | { ok: false; error: string };

/**
 * Take one contact message and mail it to the operator.
 *
 * **This send is not best-effort, and that is a deliberate departure from
 * ADR 004.** The rule exists so a mail hiccup can't fail a Stripe webhook or a
 * portal mutation — work that already happened, where the email is a
 * notification. Here the email *is* the work: there is no row, no queue, no
 * retry. If it doesn't leave, nothing happened, and telling someone "thanks,
 * we'll be in touch" would be a lie they'd wait on. This is the same reasoning
 * that makes ① the verification code fail its flow.
 *
 * The honeypot answers `ok: true` without sending. A bot that is told it failed
 * simply tries again, whereas one that is told it succeeded goes away; and on
 * the small chance a real person's autofill reached a hidden field, they are
 * not stuck arguing with an error they can't see.
 */
export async function sendContactAction(
  raw: unknown,
): Promise<ContactResult> {
  const record = (raw ?? {}) as Record<string, unknown>;

  const trap = record[HONEYPOT_FIELD];
  if (typeof trap === "string" && trap.trim() !== "") {
    console.warn("[contact] honeypot filled — dropping submission");
    return { ok: true };
  }

  const parsed = contactInputSchema.safeParse(record);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Please check the form and try again.",
    };
  }

  const sent = await sendContactMessage(parsed.data);
  if (!sent.ok) {
    return {
      ok: false,
      error:
        "We couldn't send that just now. Please try again, or email us directly.",
    };
  }

  return { ok: true };
}

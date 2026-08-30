import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearSignedCookie,
  readSignedCookie,
  setSignedCookie,
} from "@/shared/auth";
import { clientIdentifier, rateLimit } from "@/shared/lib";
import {
  FEEDBACK_CODE_COOKIE,
  FEEDBACK_CODE_TTL_S,
  MAX_FEEDBACK_CODE_ATTEMPTS,
  verifyFeedbackViewCode,
  type PendingFeedbackCode,
} from "@/domains/feedback";

/**
 * Check an access code and, on a match, return **the customer's whole view** —
 * their submissions and any feedback ready to download.
 *
 * The bcrypt check is the whole gate, so the endpoint is rate-limited to keep a
 * 6-digit code out of brute-force range within its 10-minute life. A miss
 * returns a generic error; the caller can retry until the cookie expires.
 */
const LIMIT = { limit: 8, windowSeconds: 60 };

const bodySchema = z.object({
  customerEmail: z.string().email().max(320),
  code: z.string().trim().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  const limit = rateLimit(`fbverify:${clientIdentifier(request)}`, LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter the 6-digit code from your email." },
      { status: 400 },
    );
  }

  try {
    const pending = await readSignedCookie<PendingFeedbackCode>(
      FEEDBACK_CODE_COOKIE,
    );
    const access = await verifyFeedbackViewCode(
      pending,
      parsed.data.customerEmail,
      parsed.data.code,
    );
    if (!access) {
      /*
        Count the miss in the signed cookie, and burn the code once the cap is
        spent. Without this the same issued code stayed guessable for its full
        10-minute life, leaving the (per-instance, best-effort) rate limiter as
        the only online wall on a code that reveals a customer's list and a
        child's name. After the cap the customer must request a fresh code.
      */
      const attempts = (pending?.attempts ?? 0) + 1;
      const spent = !pending || attempts >= MAX_FEEDBACK_CODE_ATTEMPTS;
      if (spent) {
        await clearSignedCookie(FEEDBACK_CODE_COOKIE);
      } else {
        await setSignedCookie(
          FEEDBACK_CODE_COOKIE,
          { ...pending, attempts },
          FEEDBACK_CODE_TTL_S,
        );
      }
      /*
        Count down like the flow's email step (Ben, QA 3.2): a wrong code says how
        many tries are left, and only the last — five wrong, or a code that is no
        longer live — sends them back to request a fresh one. The message carries
        the count so the page can stay on the code card and show it inline.
      */
      const left = MAX_FEEDBACK_CODE_ATTEMPTS - attempts;
      const error = spent
        ? pending
          ? "Too many wrong codes. Request a fresh one above."
          : "That code has expired. Request a fresh one above."
        : `That code doesn't match — ${left} ${left === 1 ? "attempt" : "attempts"} left.`;
      return NextResponse.json(
        { error },
        { status: 400 },
      );
    }
    // Single-use: a matched code is spent.
    await clearSignedCookie(FEEDBACK_CODE_COOKIE);
    // The whole view, not just the downloads: the code proved the inbox, and
    // both belong to whoever controls it.
    return NextResponse.json(access);
  } catch (err) {
    console.error("[status/feedback/verify] failed:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 502 },
    );
  }
}

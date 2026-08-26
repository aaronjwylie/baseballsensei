import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/shared/config/env";
import { QA_AUTH_COOKIE, QA_FLAG_COOKIE } from "@/domains/qa";

/**
 * Arm or disarm the QA probe for this browser.
 *
 *   /api/qa/session?token=<QA_TOKEN>        → arm, redirect home
 *   /api/qa/session?token=<QA_TOKEN>&off=1  → disarm
 *
 * **404 when `QA_TOKEN` is unset**, which is the state every deploy is in until
 * someone sets it. Not 401: an endpoint that answers "wrong token" confirms it
 * exists, and `/api` is outside the Basic Auth gate, so this is reachable by
 * anyone who guesses the path.
 *
 * Two cookies, because they answer different questions. `qa_auth` is httpOnly
 * and carries the token — it is what authorises writing. `qa_on` is readable by
 * the server layout and carries nothing but the fact that a run is happening,
 * which is what decides whether the probe is rendered at all.
 */
export const runtime = "nodejs";

function tokenMatches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which is itself a leak of
  // length; compare lengths first and always run the comparison.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const expected = env.qaToken;
  if (!expected) return new NextResponse("Not found", { status: 404 });

  const supplied = req.nextUrl.searchParams.get("token") ?? "";
  if (!tokenMatches(supplied, expected)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const off = req.nextUrl.searchParams.get("off") === "1";
  /*
    Home, with nothing appended. The arming redirect used to land on `/?qa=1`
    as a visible confirmation, and the marker then stuck to every subsequent
    visit — so one page read as two in the log, and every anchor link back to
    the landing page looked like a different destination than the first one.
    Nothing needed it: whether a run is armed is the cookie's business.
  */
  /* Where to land afterwards. Only a same-site path is honoured — a `next`
     taken at face value is an open redirect, and this endpoint is reachable by
     anyone who has the token. */
  const requested = req.nextUrl.searchParams.get("next") ?? "/";
  const target = /^\/(?!\/)[^\\]*$/.test(requested) ? requested : "/";
  const res = NextResponse.redirect(new URL(target, req.nextUrl));

  if (off) {
    res.cookies.delete(QA_AUTH_COOKIE);
    res.cookies.delete(QA_FLAG_COOKIE);
    return res;
  }

  const common = {
    path: "/",
    sameSite: "lax" as const,
    secure: req.nextUrl.protocol === "https:",
    maxAge: 60 * 60 * 8, // one working day; a run that outlives it re-arms
  };
  res.cookies.set(QA_AUTH_COOKIE, expected, { ...common, httpOnly: true });
  res.cookies.set(QA_FLAG_COOKIE, "1", { ...common, httpOnly: false });
  return res;
}

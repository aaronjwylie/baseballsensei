import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/shared/config/env";
import {
  QA_AUTH_COOKIE,
  clearEvents,
  isSensitiveField,
  readEvents,
  recordEvents,
  type QaEventInput,
} from "@/domains/qa";

/**
 * The QA log: the probe writes here, and whoever is following along reads here.
 *
 * **404 whenever `QA_TOKEN` is unset**, which is every deploy that has not
 * deliberately switched instrumentation on. Same answer for a wrong token — see
 * the session route for why it is 404 rather than 401.
 *
 * Writing is authorised by the httpOnly cookie the session route sets; reading
 * requires the token itself, because reading is the privileged half and is done
 * from a terminal rather than a browser.
 *
 * A last line of defence lives in POST: anything whose field name looks
 * sensitive is dropped here as well as in the probe. The probe is the thing
 * being tested during a QA run, and a bug in it must not be able to write a
 * password into a production table.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function matches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const notFound = () => new NextResponse("Not found", { status: 404 });

export async function POST(req: NextRequest) {
  const expected = env.qaToken;
  if (!expected) return notFound();

  const cookie = req.cookies.get(QA_AUTH_COOKIE)?.value ?? "";
  if (!matches(cookie, expected)) return notFound();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const events = Array.isArray((body as { events?: unknown })?.events)
    ? ((body as { events: QaEventInput[] }).events)
    : [];

  /*
    Redact here as well as in the probe.

    A browser running an older bundle keeps posting whatever it was built to
    post, and on 2026-08-30 that included `/reset-password?token=…` — a live
    admin credential, written to a production table. The probe is the thing
    under test during a QA run (Q2); a rule that only exists in the thing being
    tested is not a rule.
  */
  const redactPath = (path: string) =>
    path
      .replace(/\/(status|feedback|reset-password)\/[^/?#]{12,}/g, "/$1/<redacted>")
      .replace(/\?.*$/, "?<redacted>");

  const scrubbed = events.map((e) => ({
    ...e,
    path: redactPath(e.path ?? ""),
    target: e.target ? redactPath(e.target) : e.target,
  }));

  const safe = scrubbed.filter(
    (e) => !(e.field && isSensitiveField(e.field)),
  );

  try {
    const written = await recordEvents(safe);
    return NextResponse.json({ ok: true, written });
  } catch (err) {
    console.error("[qa] record failed:", err);
    // Never fail loudly at the probe: a broken QA log must not become the bug
    // under investigation.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export async function GET(req: NextRequest) {
  const expected = env.qaToken;
  if (!expected) return notFound();

  const supplied =
    req.nextUrl.searchParams.get("token") ??
    req.headers.get("x-qa-token") ??
    "";
  if (!matches(supplied, expected)) return notFound();

  if (req.nextUrl.searchParams.get("clear") === "1") {
    await clearEvents();
    return NextResponse.json({ ok: true, cleared: true });
  }

  const sinceRaw = req.nextUrl.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const rows = await readEvents(
    since && !Number.isNaN(since.getTime()) ? since : null,
    Number(req.nextUrl.searchParams.get("limit") ?? 200),
  );
  return NextResponse.json({ ok: true, count: rows.length, events: rows });
}

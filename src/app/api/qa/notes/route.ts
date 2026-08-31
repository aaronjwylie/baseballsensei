import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/shared/config/env";
import {
  itinerary,
  itineraryMeta,
  readFieldChecks,
  addNote,
  deleteNote,
  editNote,
  readNotes,
  setNoteStatus,
  NOTE_STATUSES,
  type NoteStatus,
} from "@/domains/qa";

/**
 * The findings from a pass, for whoever is fixing them.
 *
 * A note on the board is prose about a check, and prose about a check is only
 * actionable beside the check itself — "the panel is see-through" means nothing
 * without 1.1.16's "solid dark ground, the hero photo must not show through".
 * So this joins the two and hands back one object per finding.
 *
 * **Token-gated and 404 on failure**, exactly like the event log: the token is
 * the privileged half, this is read from a terminal rather than a browser, and
 * `/api` sits outside the site's Basic Auth so a 401 here would tell an
 * anonymous caller the route exists.
 *
 * `POST` writes one, `PATCH` edits it or moves its status, `DELETE` removes it —
 * the same three things the board offers, for whoever is working from a
 * terminal rather than a browser.
 *
 * **A note written here must name its author**, and the field is required
 * rather than defaulted. Two people and a watcher share one token, so the token
 * says nothing about who observed a thing; without a name the board would show
 * findings that nobody can be asked about. The board takes the name from a
 * field the tester filled in; here it is `by`, and a request without one is
 * refused rather than filed anonymously.
 *
 * `PATCH` also moves a note along its states. It is here rather than only in
 * the page's server action because the fixer works from a terminal — a session
 * that has just pushed a patch should be able to say so without a browser, and
 * `resolved` is deliberately still the tester's word (the page is where it is
 * given).
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

function authorised(req: NextRequest): boolean {
  const expected = env.qaToken;
  if (!expected) return false;
  const supplied =
    req.nextUrl.searchParams.get("token") ?? req.headers.get("x-qa-token") ?? "";
  return matches(supplied, expected);
}

/** Every check the board knows about, generated and field-added alike. */
async function checkText(): Promise<Map<string, { what: string; expect: string }>> {
  const map = new Map<string, { what: string; expect: string }>();
  for (const phase of itinerary)
    for (const group of phase.groups)
      for (const check of group.checks)
        map.set(check.id, { what: check.what, expect: check.expect });
  for (const f of await readFieldChecks())
    map.set(f.id, { what: f.what, expect: f.expect });
  return map;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return notFound();

  const wanted = req.nextUrl.searchParams.get("status");
  const text = await checkText();
  const notes = (await readNotes())
    .filter((n) => !wanted || n.status === wanted)
    .map((n) => ({
      id: n.id,
      checkId: n.checkId,
      status: n.status,
      body: n.body,
      browser: n.browser,
      author: n.author,
      at: n.at.toISOString(),
      statusBy: n.statusBy,
      statusAt: n.statusAt?.toISOString() ?? null,
      /* The check's own words, so a fix is chosen against the expectation
         rather than against a guess at it. Null when the note outlives its
         check — a retired check keeps its findings. */
      check: text.get(n.checkId) ?? null,
    }));

  return NextResponse.json({
    ok: true,
    build: itineraryMeta.build,
    count: notes.length,
    notes,
  });
}

export async function PATCH(req: NextRequest) {
  if (!authorised(req)) return notFound();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const { id, status, by, body: text } = (body ?? {}) as {
    id?: string;
    status?: string;
    by?: string;
    body?: string;
  };

  /* An edit and a status change are separate operations on one route because
     they are one thought — "I got that wrong" — and splitting them across two
     calls invites the second being forgotten. */
  if (id && typeof text === "string") {
    const done = await editNote(id, text.trim());
    if (!done) {
      return NextResponse.json(
        { ok: false, error: "Not editable: someone has claimed or closed it." },
        { status: 409 },
      );
    }
    if (!status) return NextResponse.json({ ok: true });
  }

  if (!id || !NOTE_STATUSES.includes(status as NoteStatus)) {
    /* Read from the list rather than spelled out again here. The first version
       repeated the three names inline, which meant adding a fourth left the API
       refusing a status the board was already setting. */
    return NextResponse.json(
      { ok: false, error: `id and status (${NOTE_STATUSES.join("|")}) required` },
      { status: 400 },
    );
  }

  await setNoteStatus(id, status as NoteStatus, by ?? null);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return notFound();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const { checkId, body: text, browser, by } = (body ?? {}) as {
    checkId?: string;
    body?: string;
    browser?: string;
    by?: string;
  };
  if (!checkId || !text?.trim()) {
    return NextResponse.json(
      { ok: false, error: "checkId and body required" },
      { status: 400 },
    );
  }
  if (!by?.trim()) {
    /* Required, not defaulted — see the note at the top of this file. */
    return NextResponse.json(
      { ok: false, error: "by required: a finding nobody can be asked about is half a finding" },
      { status: 400 },
    );
  }

  const row = await addNote({
    checkId,
    body: text.trim(),
    browser: browser?.trim() || null,
    author: by.trim(),
  });
  return NextResponse.json({ ok: true, id: row.id });
}

export async function DELETE(req: NextRequest) {
  if (!authorised(req)) return notFound();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const done = await deleteNote(id);
  return done
    ? NextResponse.json({ ok: true })
    : NextResponse.json(
        { ok: false, error: "Not deletable: someone has claimed or closed it." },
        { status: 409 },
      );
}

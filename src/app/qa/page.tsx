import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/shared/ui";
import {
  QaBoard,
  itinerary,
  itineraryMeta,
  qaAccess,
  readMarks,
  readNotes,
  readFieldChecks,
  setMarkAction,
  addNoteAction,
  editNoteAction,
  deleteNoteAction,
  setNoteStatusAction,
  addFieldCheckAction,
  withdrawFieldCheckAction,
  type FieldCheck,
  type Mark,
  type Note,
  type NoteRevision,
} from "@/domains/qa";

function parseRevisions(raw: string | null): NoteRevision[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NoteRevision[]) : [];
  } catch {
    return [];
  }
}

export const metadata: Metadata = { title: "QA run", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * What an unarmed browser sees.
 *
 * It says what to do rather than pretending nothing is here — the page is
 * already behind the site's Basic Auth gate, so anyone reading this was let in
 * on purpose.
 */
function NotArmed() {
  return (
    <section className="py-20">
      <Container className="max-w-xl">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          QA run
        </p>
        <h1 className="mt-2 font-display text-[32px] font-medium uppercase leading-none tracking-[-0.02em] text-ink">
          This browser is not armed
        </h1>
        <p className="mt-4 text-[15px] leading-[1.5] text-ink-soft">
          The shared record is here, but this browser has not been given the QA
          token yet. Open this page once with the token on the end of the
          address and it will remember:
        </p>
        <p className="mt-4 break-all border-2 border-line bg-paper-alt px-4 py-3 font-mono text-[13px] text-ink">
          /qa?token=&lt;QA_TOKEN&gt;
        </p>
        <p className="mt-4 text-[13px] text-ink-muted">
          Whoever set the token up has it. It lasts eight hours per browser, so
          you may simply need to do this again.
        </p>
      </Container>
    </section>
  );
}

/**
 * The shared QA record, on the site rather than in an artifact.
 *
 * Everything that made the artifact version hard is absent here: both testers
 * are already authenticated by the site's own gate, the state is a table rather
 * than a document that republishes itself, marks appear for the other person
 * within seconds without anybody reloading, and the page is instrumented by the
 * same probe as every other — so the record's clicks and the product's clicks
 * land in one log instead of two.
 *
 * **The gate follows whatever protects the site.** While Basic Auth is on,
 * everyone here already proved themselves at the front door and the record asks
 * for nothing more. When it comes off, `QA_TOKEN` takes over — see `qaAccess`.
 * With neither, the page 404s, because a public list of every check in the
 * product is not something to serve.
 *
 * Temporary. It goes with the tables when the pass is over.
 */
export default async function QaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [access, params] = await Promise.all([qaAccess(), searchParams]);

  /* No Basic Auth and no token means nothing is protecting this page, and a
     public list of every check in the product is not something to serve. */
  if (access === "absent") notFound();

  /* Arming from here, not only from the API route.

     A missing cookie used to 404 exactly like a missing feature, and the first
     person to open this page met "page cannot be found" with no way to tell
     which it was. The secrecy was borrowed from `/api/qa/*`, where it is right
     because anyone can probe those; it is pointless here, because the site's
     own Basic Auth gate already stands in front of this page. So: a token in
     the query arms the browser, and no token at all explains itself. */
  if (access !== "granted" && params.token) {
    /* Handed to the route that owns cookie-setting rather than done here: a
       Server Component cannot write cookies, and trying returned a 500 that
       said nothing about why. The route validates the token, so a wrong one
       lands back on the unarmed page. */
    redirect(`/api/qa/session?token=${encodeURIComponent(params.token)}&next=/qa`);
  }

  if (access !== "granted") return <NotArmed />;

  const rows = await readMarks();
  const marks: Mark[] = rows.map((r) => ({
    checkId: r.checkId,
    value: r.value as Mark["value"],
    note: r.note,
    actor: r.actor,
    updatedAt: r.updatedAt.toISOString(),
  }));

  const notes: Note[] = (await readNotes()).map((n) => ({
    id: n.id,
    checkId: n.checkId,
    body: n.body,
    browser: n.browser,
    author: n.author,
    status: n.status as Note["status"],
    statusBy: n.statusBy,
    statusAt: n.statusAt?.toISOString() ?? null,
    at: n.at.toISOString(),
    /* Parsed here rather than in the client: a malformed value is a broken
       board, and it is better for it to be an empty list than a render that
       throws on every poll. */
    revisions: parseRevisions(n.revisions),
  }));

  /* Withdrawn rows keep their ids but leave the board — the id stays spent,
     which is the whole reason the row is not deleted. Reconciled ones leave
     too: by then the markdown carries them and rendering both would show the
     check twice. */
  const fieldChecks: FieldCheck[] = (await readFieldChecks())
    .filter((f) => !f.withdrawnAt && !f.reconciledAt)
    .map((f) => ({
      id: f.id,
      what: f.what,
      expect: f.expect,
      author: f.author,
      at: f.at.toISOString(),
    }));


  return (
    <section className="py-10">
      <Container>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          Manual pass · production
        </p>
        <h1 className="mt-1 font-display text-[32px] font-medium uppercase leading-none tracking-[-0.02em] text-ink lg:text-[40px]">
          QA run
        </h1>
        <p className="mt-3 max-w-[60ch] text-[15px] text-ink-soft">
          {itineraryMeta.live} live checks across {itinerary.length} phases. Marks
          are shared: set one and the other person sees it within a few seconds,
          without reloading.
        </p>

        {/*
          Which itinerary this is. Unambiguous in a way the artifact's number
          never could be — the page is server-rendered from a deploy, so what
          you are reading is what was built, and two people comparing this line
          are comparing the same thing.
        */}
        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-1 border-t-2 border-ink pt-3 font-display text-[11px] uppercase tracking-[0.08em]">
          <div className="flex gap-2">
            <dt className="text-ink-muted">Itinerary</dt>
            <dd className="bg-highlight px-1.5 font-semibold text-ink">
              Build {itineraryMeta.build}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted">Generated</dt>
            <dd className="tabular-nums text-ink">
              {itineraryMeta.generatedAt.slice(0, 16).replace("T", " ")}Z
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted">Checks</dt>
            <dd className="tabular-nums text-ink">
              {itineraryMeta.live} live
              {itineraryMeta.retired > 0 && ` · ${itineraryMeta.retired} retired`}
              {itineraryMeta.edited > 0 && ` · ${itineraryMeta.edited} reworded`}
            </dd>
          </div>
        </dl>

        <div className="mt-8">
          <QaBoard
            phases={itinerary}
            initialMarks={marks}
            initialNotes={notes}
            initialFieldChecks={fieldChecks}
            initialName=""
            onMark={setMarkAction}
            onNote={addNoteAction}
            onEditNote={editNoteAction}
            onDeleteNote={deleteNoteAction}
            onNoteStatus={setNoteStatusAction}
            onAddCheck={addFieldCheckAction}
            onWithdrawCheck={withdrawFieldCheckAction}
          />
        </div>
      </Container>
    </section>
  );
}

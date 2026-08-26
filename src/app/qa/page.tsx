import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/shared/ui";
import { env } from "@/shared/config/env";
import {
  QA_AUTH_COOKIE,
  QaBoard,
  itinerary,
  readMarks,
  setMarkAction,
  type Mark,
} from "@/domains/qa";

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
 * **404, not 401, and off by default.** Same rule as the rest of the QA domain:
 * with `QA_TOKEN` unset the page does not exist, and without the arming cookie
 * neither does it. `/qa` is outside the operator portal and would otherwise be
 * a page anybody could find.
 *
 * Temporary. It goes with the tables when the pass is over.
 */
export default async function QaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  /* Unset means the whole QA subsystem is off, and then this page genuinely
     does not exist. That one stays a 404. */
  if (!env.qaToken) notFound();

  const [jar, params] = await Promise.all([cookies(), searchParams]);

  /* Arming from here, not only from the API route.

     A missing cookie used to 404 exactly like a missing feature, and the first
     person to open this page met "page cannot be found" with no way to tell
     which it was. The secrecy was borrowed from `/api/qa/*`, where it is right
     because anyone can probe those; it is pointless here, because the site's
     own Basic Auth gate already stands in front of this page. So: a token in
     the query arms the browser, and no token at all explains itself. */
  if (params.token) {
    /* Handed to the route that owns cookie-setting rather than done here: a
       Server Component cannot write cookies, and trying returned a 500 that
       said nothing about why. The route validates the token, so a wrong one
       lands back on the unarmed page. */
    redirect(`/api/qa/session?token=${encodeURIComponent(params.token)}&next=/qa`);
  }

  if (jar.get(QA_AUTH_COOKIE)?.value !== env.qaToken) return <NotArmed />;

  const rows = await readMarks();
  const marks: Mark[] = rows.map((r) => ({
    checkId: r.checkId,
    value: r.value as Mark["value"],
    note: r.note,
    actor: r.actor,
    updatedAt: r.updatedAt.toISOString(),
  }));

  const all = itinerary.flatMap((p) => p.groups.flatMap((g) => g.checks));

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
          {all.length} checks, {itinerary.length} phases. Marks are shared — whoever
          armed a browser for the pass can set them, and the other person sees them
          within a few seconds without reloading.
        </p>

        <div className="mt-8">
          <QaBoard
            phases={itinerary}
            initialMarks={marks}
            actor=""
            onMark={setMarkAction}
          />
        </div>
      </Container>
    </section>
  );
}

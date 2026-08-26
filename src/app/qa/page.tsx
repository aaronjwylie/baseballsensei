import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
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
export default async function QaPage() {
  if (!env.qaToken) notFound();
  const jar = await cookies();
  if (jar.get(QA_AUTH_COOKIE)?.value !== env.qaToken) notFound();

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

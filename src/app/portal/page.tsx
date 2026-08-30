import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession, portalsFor, HOME_FOR_ROLE } from "@/domains/account";

export const metadata: Metadata = {
  title: "Choose a portal",
  robots: { index: false },
};

const BLURB: Record<string, string> = {
  admin: "The queue, onboarding, settings — running the platform.",
  coach: "Submissions assigned to you, and where you upload your feedback.",
  translator: "Submissions waiting on a translation, out and back.",
};

/**
 * Where someone lands when they are more than one kind of operator.
 *
 * The alternative was guessing — send an admin-who-also-coaches to `/admin` and
 * let them navigate. That is wrong for exactly the person it affects most: they
 * are doing one of those two jobs on any given login, and only they know which.
 *
 * Anyone holding a single kind never sees this page; login sends them straight
 * through, and the redirect below covers the case of arriving here by URL.
 */
export default async function PortalChooserPage() {
  const session = await requireSession();
  const mine = portalsFor(session.roles);

  if (mine.length === 1) redirect(HOME_FOR_ROLE[mine[0]]);

  return (
    <div className="flex grow items-center justify-center px-4 py-16">
      <div className="w-full max-w-3xl text-center">
        <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">
          Where are you working?
        </h1>

        {mine.length === 0 ? (
          /*
            Onboarded, no kinds granted. A real state — someone can be created
            before anyone decides what they do — and it must read as "waiting on
            an admin" rather than as a broken login, because the person seeing it
            cannot fix it themselves.
          */
          <p className="mx-auto mt-4 max-w-md text-sm text-ink-muted">
            Your account is set up, but nobody has assigned you a role yet. An
            admin needs to add you as a coach, a translator, or an admin before
            there is anywhere to go.
          </p>
        ) : (
          <>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
              You hold more than one role. Pick the one you are here for &mdash;
              you can switch any time.
            </p>
            {/* One row of equal cards: flex-1 makes every card the same width and
                the row's default stretch makes them the same height, so a longer
                blurb doesn't grow its card past the others (Ben, QA 4.4). */}
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              {mine.map((role) => (
                <Link
                  key={role}
                  href={HOME_FOR_ROLE[role]}
                  className="flex flex-1 flex-col rounded-2xl border border-line bg-white p-6 text-left shadow-sm transition-colors hover:border-ink"
                >
                  <span className="font-display text-lg font-medium uppercase tracking-[-0.01em] text-ink">
                    {role}
                  </span>
                  <span className="mt-2 text-sm text-ink-muted">
                    {BLURB[role]}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

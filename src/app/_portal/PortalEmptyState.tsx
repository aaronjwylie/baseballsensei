import type { ReactNode } from "react";

/**
 * The centered, framed "nothing to do here" panel for the operator portals that
 * can legitimately be empty — the translator (whose in-app queue is a later
 * phase) and a coach with no current assignments.
 *
 * Left-aligned text bunched under the bar read as a broken page; a centered card
 * in the middle of the space reads as a calm, finished state (Ben, QA 4.6). It
 * grows to fill the portal's content area, which is why the coach and translator
 * layouts make that area a growing flex column.
 */
export function PortalEmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex grow items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
        <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">
          {title}
        </h1>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted">
          {children}
        </div>
      </div>
    </div>
  );
}

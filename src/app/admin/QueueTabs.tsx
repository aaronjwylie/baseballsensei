"use client";

import { Fragment, useState, type ReactNode } from "react";

/**
 * The status tabs, filtering the queue **in the browser**.
 *
 * The server hands over every submission once — already rendered — and the tab
 * bar just decides which to show. Clicking a tab is client state, not a
 * navigation: there is nothing to fetch, because the row for every tab is
 * already here. It used to be a `<Link href="/admin?status=…">`, so each click
 * was a full server round trip that re-read every submission and filtered it in
 * memory — data the server already had in hand (QA 5.2).
 *
 * `?status=` is still written to the URL for a shareable link, but with
 * `replaceState` so it neither fetches nor adds a history entry per click.
 *
 * Each row carries the tab keys it belongs to, computed server-side from the
 * same predicates that count the tabs — so the filter here is a membership test,
 * not a second copy of the matching rules that could drift from them.
 */
export function QueueTabs({
  tabs,
  initialKey,
  rows,
}: {
  tabs: { key: string; label: string; count: number }[];
  initialKey: string;
  rows: { id: string; tabKeys: string[]; node: ReactNode }[];
}) {
  const [active, setActive] = useState(initialKey);
  const visible = rows.filter((r) => r.tabKeys.includes(active));

  function pick(key: string) {
    setActive(key);
    // A shareable URL without a navigation — no server round trip, and
    // replaceState so ten tab clicks don't become ten back-button steps.
    window.history.replaceState(
      null,
      "",
      key === "all" ? "/admin" : `/admin?status=${key}`,
    );
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => pick(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-ink bg-ink text-surface"
                  : "border-line bg-white text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
              <span className={isActive ? "opacity-80" : "text-ink-muted"}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-muted">
            {rows.length === 0
              ? "No submissions yet. They'll appear here once a customer uploads and pays."
              : "No submissions in this view."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,200px)_1fr_minmax(0,150px)_30px] gap-4 border-b border-line bg-paper-alt px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted max-[860px]:hidden">
              <div>Player</div>
              <div>Progress</div>
              <div />
              <div />
            </div>
            {visible.map((r) => (
              <Fragment key={r.id}>{r.node}</Fragment>
            ))}
          </>
        )}
      </div>
    </>
  );
}

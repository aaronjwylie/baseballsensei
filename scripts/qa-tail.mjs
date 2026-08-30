#!/usr/bin/env node
/**
 * Follow a QA run.
 *
 *   npm run qa:tail              -- follow live
 *   npm run qa:tail -- --once    -- print what's there and stop
 *   npm run qa:tail -- --clear   -- wipe the log, then stop
 *   npm run qa:tail -- --local http://localhost:3000
 *
 * **Times are printed in the reader's own zone**, with the UTC instant beside
 * them. The rows themselves are `timestamp with time zone` — an absolute
 * instant, not a wall clock — which is the right way to store them for a team
 * split between Vancouver and Tokyo. But reading them back raw means the log
 * says 19:28 while the person who did the clicking is looking at 12:28, and
 * every other console we cross-reference during a run (Stripe, Resend, Vercel)
 * is UTC as well. Printing both is what keeps a conversation about *when*
 * something happened from becoming a conversation about timezones.
 *
 * This is the same call `shared/ui/LocalTime` makes for the portal, for the
 * same reason.
 */
import env from "@next/env";
env.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const token = process.env.QA_TOKEN;
if (!token) {
  console.error("QA_TOKEN is not set. It lives in .env.local.");
  process.exit(1);
}
const base = valueOf("--local") ?? "https://www.baseball-sensei.com";

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const clock = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

/** Who did it — the session id is opaque, so keep a stable short label. */
const labels = new Map();
const labelFor = (session) => {
  if (!labels.has(session)) labels.set(session, `#${labels.size + 1}`);
  return labels.get(session);
};

const KIND_MARK = {
  error: "  <-- SHOWN/ERROR",
  fetch: "  <-- REQUEST FAILED",
  console: "  <-- CONSOLE",
  submit: "  <-- SUBMIT",
  state: "  <-- TICK MOVED",
};

async function fetchEvents(since) {
  const url = new URL(`${base}/api/qa/events`);
  url.searchParams.set("token", token);
  url.searchParams.set("limit", "250");
  if (since) url.searchParams.set("since", since);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} from ${base}`);
  return res.json();
}

if (has("--clear")) {
  const url = new URL(`${base}/api/qa/events`);
  url.searchParams.set("token", token);
  url.searchParams.set("clear", "1");
  const res = await fetch(url);
  console.log(res.ok ? "Log cleared." : `Failed: ${res.status}`);
  process.exit(res.ok ? 0 : 1);
}

function render(events) {
  for (const e of events) {
    const d = new Date(e.at);
    const local = clock.format(d);
    const utc = e.at.slice(11, 19);
    /* A tick's meaning is its state, so show it inline rather than making the
       reader open the detail. */
    let what = (e.target || e.field || "").slice(0, 66);
    if (e.kind === "field" && e.detail) {
      try {
        const d = JSON.parse(e.detail);
        if (typeof d.checked === "boolean")
          what = `${d.label || e.field} → ${d.checked ? "CHECKED" : "unchecked"}`;
      } catch {
        /* leave `what` as it was */
      }
    }
    console.log(
      `${local} (${utc}Z) ${labelFor(e.session).padEnd(3)} ${e.kind.padEnd(7)} ` +
        `${(e.path || "").padEnd(16)} ${what}${KIND_MARK[e.kind] ?? ""}`,
    );
    /* A state line carries the whole picture; print it under the diff so the
       reader never has to reconstruct it from a sequence of deltas. */
    if (e.kind === "state" && e.detail) {
      try {
        const all = JSON.parse(e.detail);
        const cells = Object.entries(all).map(
          ([k, v]) => `${v ? "[x]" : "[ ]"} ${k}`,
        );
        for (const cell of cells) console.log(`${" ".repeat(22)}${cell}`);
      } catch {
        /* not JSON — nothing to add */
      }
    }
  }
}

console.log(`Following ${base}`);
console.log(`Times shown in ${ZONE}, with UTC beside them.\n`);

/**
 * Rows are de-duplicated by id, not trusted to fall outside `since`.
 *
 * `since` is the previous batch's last `at`, which arrives here as JSON —
 * millisecond precision, while Postgres stores microseconds. So
 * `at > '…:40.123'` still matches a row stored at `…:40.123456`, and that row
 * comes back on every single poll, forever. It looked like the tester clicking
 * the same thing eight times.
 *
 * `at` also cannot separate two events in the same millisecond (the table says
 * so itself), so no timestamp cursor was ever going to be exact. The id is.
 */
const seen = new Set();
const fresh = (events) => {
  const out = events.filter((e) => !seen.has(e.id));
  for (const e of out) seen.add(e.id);
  // The window only needs to outlive one poll; keep it bounded anyway.
  if (seen.size > 5000) for (const id of [...seen].slice(0, 2500)) seen.delete(id);
  return out;
};

let since = null;
const first = await fetchEvents(null);
render(fresh(first.events));
if (first.events.length) since = first.events[first.events.length - 1].at;
if (has("--once")) process.exit(0);

console.log("\n… following. Ctrl-C to stop.\n");
for (;;) {
  await new Promise((r) => setTimeout(r, 4000));
  try {
    const next = await fetchEvents(since);
    if (next.events.length) {
      render(fresh(next.events));
      since = next.events[next.events.length - 1].at;
    }
  } catch (err) {
    console.error(`  (poll failed: ${err.message})`);
  }
}

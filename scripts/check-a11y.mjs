#!/usr/bin/env node
/**
 * The two accessibility rules a static pass can actually settle (QA 10.3, 10.4).
 *
 *   node scripts/check-a11y.mjs
 *
 * **Every form control has an accessible name.** A placeholder is not one: it
 * disappears the moment you type, and a screen reader may never announce it. A
 * bare `<select>` is worse — it is read out as "combo box" with no indication of
 * what it chooses. Four controls in the admin panel were in exactly those two
 * states on 2026-09-10.
 *
 * **Every image resolves the question one way or the other.** A missing `alt`
 * is undecided, which a screen reader resolves by reading the filename; an empty
 * one is a decision, and the right one for a background or a band.
 *
 * A name may come from four places, all of which count:
 *   `aria-label` · `aria-labelledby` · an `id` a `htmlFor` points at ·
 *   an enclosing `<label>` or `<Field>` (which is a label)
 * and `aria-hidden` controls are exempt — the contact form's honeypot is not in
 * the accessibility tree at all, which is the point of it.
 *
 * **A primitive is labelled by its caller.** `PasswordInput` wraps an `<input>`
 * and deliberately carries no name of its own: it is always used inside a
 * `<Field>`, and an `aria-label` on it would *override* the visible label rather
 * than agree with it. So it is exempt where it is defined and checked where it
 * is used — every call site must sit inside a `<Field>` or a `<label>`, which is
 * the guarantee the exemption is trading on.
 *
 * Static, so it cannot see focus order or contrast. Those are 10.1/10.2 and want
 * a browser. This is the part that regresses silently.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith(".tsx")) files.push(full);
  }
})("src");

/**
 * Components that wrap a control and take their name from the caller. Exempt
 * where defined, verified where used.
 */
const PRIMITIVES = ["PasswordInput"];

const problems = [];
let controls = 0;
let images = 0;
let primitiveUses = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  // Blank comments but keep offsets, so prose about `<img>` isn't a finding.
  const s = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
  const at = (i) => `${file.replace("src/", "")}:${s.slice(0, i).split("\n").length}`;
  const bodyAfter = (end) => {
    const next = s.indexOf("<", end);
    return s.slice(end, next === -1 ? s.length : next);
  };

  const labelFor = new Set(
    [...s.matchAll(/htmlFor=(\{[^}]*\}|"[^"]*")/g)].map((m) =>
      m[1].replace(/[{}"]/g, ""),
    ),
  );
  const wraps = [
    ...[...s.matchAll(/<(Field|label)\b/g)].map((m) => [m.index, 1]),
    ...[...s.matchAll(/<\/(Field|label)>/g)].map((m) => [m.index, -1]),
  ].sort((a, b) => a[0] - b[0]);
  const openAt = (pos) =>
    wraps.reduce((d, [off, delta]) => (off <= pos ? d + delta : d), 0);

  const definesPrimitive = PRIMITIVES.some((p) =>
    new RegExp(`export function ${p}\\b`).test(s),
  );

  // Every use of a primitive has to be inside something that names it.
  for (const p of PRIMITIVES) {
    for (const m of s.matchAll(new RegExp(`<${p}\\b`, "g"))) {
      primitiveUses += 1;
      if (openAt(m.index) <= 0) {
        problems.push(`${at(m.index)}  <${p}> is not inside a Field or label`);
      }
    }
  }

  for (const m of s.matchAll(/<(input|select|textarea)\b/g)) {
    if (definesPrimitive) continue;
    const body = bodyAfter(m.index + m[0].length);
    if (/type="hidden"/.test(body) || /\baria-hidden\b/.test(body)) continue;
    controls += 1;
    const id = body.match(/\bid=(\{[^}]*\}|"[^"]*")/)?.[1].replace(/[{}"]/g, "");
    const named =
      /aria-label(?:ledby)?=/.test(body) ||
      openAt(m.index) > 0 ||
      (id && labelFor.has(id));
    if (!named) {
      problems.push(`${at(m.index)}  <${m[1]}> has no accessible name`);
    }
  }

  for (const m of s.matchAll(/<(?:Image|img)\b/g)) {
    const body = bodyAfter(m.index + m[0].length);
    images += 1;
    if (!/\balt=/.test(body)) {
      problems.push(`${at(m.index)}  image has no alt (use alt="" if decorative)`);
    }
  }
}

if (problems.length === 0) {
  console.log(
    `[a11y] ok — ${controls} controls named, ${primitiveUses} via a wrapper, ` +
      `${images} images decided`,
  );
  process.exit(0);
}
console.error(`[a11y] ${problems.length} problem(s):\n`);
for (const p of problems) console.error(`  ${p}`);
process.exit(1);

# shared — `src/shared/`

The **domain-less floor.** Everything here is true regardless of what business this app is
in. Nothing here knows what a Submission is.

---

## 1 · The northstar

`shared/` holds the things a *different* product could use unchanged: an HTTP transport, a
button, an env loader. The test for whether something belongs here is not "is it used
twice?" but **"is it still true if the domain changes?"**

```
shared/
  db/         the Postgres connection — `db`, and nothing else
  storage/    the storage seam — local-disk (dev) + Blob (prod) drivers
  upload/     the browser upload transport (moved here from a domain 2026-08-06)
  auth/       the session-cookie seam — jose token + cookie helpers
  stripe/     the SDK singleton
  email/      the Resend transport + the brand shell every message wears
  seo/        JSON-LD schema builders + the <JsonLd> tag (site-wide structured data)
  lib/        rateLimit · flowWindow · codeEntry · actionResult — domain-less helpers
  ui/         Button · ButtonLink · Container · Field · FieldSelect · Pill ·
              PasswordInput · LocalTime · SavedBadge · SectionHeading
  layout/     SiteHeader · SiteFooter · SiteChrome · MobileNav · Logo ·
              navLinks · AnchorScrollLink/Button · LegalPage
  config/     env (the only process.env reader) · site (brand facts) · publicEnv
```

### The invariants

- **`shared/` never imports a domain.** Not once, in either direction of convenience. If
  something here needs to know what a Submission is, it isn't shared — it's a domain's `api/`.
  *(This was violated during Step 2 and caught by the check below.)*
- **`db/` holds the connection, not the tables** — since 2026-08-05
  ([ADR 015](../../docs/decisions/015-schema-by-domain.md)). Every table and enum moved to the
  domain that owns it, and the manifest drizzle-kit reads sits at `src/db/schema.ts`, outside
  the layer cake, because a file importing every domain can't live on a domain-less floor.
  `client.ts` passes **no `schema` argument** to `drizzle()` for the same reason — that argument
  exists only to power the relational query API (`db.query.x`), which this codebase has never
  used. This invariant is what forced both moves; it did its job.
- **Every `process.env` read lives in `config/env.ts`.** Required values throw at point of
  use with a message naming the variable, so a misconfiguration is a clear error rather than
  `undefined` propagating into an API call.
- **`env` uses lazy getters, not eager parsing.** CLAUDE.md §6 specifies a Zod schema parsed
  at import. That would fail every build in an environment without production secrets —
  including Vercel preview builds and CI. Lazy reads fail at the point of use, where the
  error is also more useful. **This is a deliberate deviation from the spec.**
- **`email/` owns the shell, not the messages.** The transactional messages (nine on-spine,
  see [`email/_EmailDocumentation.md`](email/_EmailDocumentation.md)) are genuinely different
  and live in their domains as `api/xEmail.ts`; what they share — header, type scale, CTA,
  footer — is written once here. `emailShell` also carries the shared `escapeHtml`, since every
  template lands customer-supplied values in HTML. *(PRINCIPLES #8.)*
- **`layout/` is domain-less on purpose.** Header and footer link to routes but know nothing
  about what happens on them. If they ever needed to, they'd stop being shared and become a
  widget layer — which this codebase deliberately doesn't have yet.

---

> **`shared/email` has its own doc.** The transport lives here, but *which messages exist and
> who receives them* is a product question spanning several domains — see
> [`email/_EmailDocumentation.md`](email/_EmailDocumentation.md). It's the only seam under
> `shared/` that owns a decision rather than just a mechanism.

## 2 · Where we are now — 2026-08-01

Three things landed in the shared floor, each because two domains needed it and
neither could own it (PRINCIPLES §5).

- ✅ **`lib/flowWindow.ts`** — the flow window, 30 minutes sliding. `submission`
  owns the session and `verification` owns the code; a constant copied into both
  is how one clock quietly becomes two. Putting it here makes "one clock"
  structural rather than a comment someone has to honour.
- ✅ **`email/client.ts` reports.** `sendEmail` returns a boolean and still never
  throws. "Best-effort" (ADR 004) was always about not failing a webhook or a
  portal action; it never meant delivery should be *unknowable*, and the one
  caller whose customer is blocked on the message needs to know.
- ✅ **`storage/index.ts` gained `translationFileKey`** — the two translation
  folders get their own subfolders in the object store, so the four folders are
  visible in raw storage as well as in the database. That matters the one time
  someone has to look.

### Since 2026-08-01

The floor kept growing as two-domain needs surfaced and the QA pass fed fixes back
into shared primitives.

- ✅ **`upload/` is a shared seam now (2026-08-06).** The browser upload transport
  left `domains/upload/ui/`, where `checkout`, `feedback` and `upload` all reached
  across for it and closed a `feedback → upload → feedback` cycle. It passes the
  `shared/` test outright — a domain home *forced* another domain to import it.
- ✅ **`seo/` (2026-08-29).** JSON-LD schema builders (Organization, WebSite,
  Service/Offer) and a `<JsonLd>` tag, so the site-wide structured data has one
  domain-less home; the landing slice adds its own `FAQPage` on top.
- ✅ **`lib/` gained `codeEntry` and `actionResult`.** `MAX_CODE_ATTEMPTS` is the
  single source for the five-guess code-entry cap the verification gate and the
  `/status` feedback code both use (QA 3.2); `actionResult` is the shared
  `succeeded`/`failed` result shape for server actions.
- ✅ **`ui/` roughly doubled** as the approved design and the QA pass landed:
  `FieldSelect` (a Radix dropdown replacing the native `<select>`, QA 2.1.5),
  `PasswordInput` (every password field is revealable), `LocalTime`, `SavedBadge`
  and `SectionHeading`. `Field` grew `selectClass` (native selects sized by an
  explicit height, QA 5.13.4) and `buttonStyles` grew a `danger` variant for
  destructive actions.
- ✅ **`layout/` gained the marketing chrome** — `SiteChrome` (the header floats
  transparent over the hero and is ink everywhere else), `MobileNav`, the
  `AnchorScroll` link/button pair (same-page anchors that scroll on repeat taps),
  and `LegalPage` (the themed terms/privacy shell).
- ✅ **The transactional emails wear the site theme (#40).** `shell.ts` still
  builds HTML strings (no React Email), mirroring the `globals.css` hex by hand,
  and `emailShell` grew an optional `footerNote` so an operator-facing message
  isn't described to a coach as being "about your coaching submission".


### Before 2026-08-01

- ✅ **The seams** — `db` (Postgres/Drizzle), `storage` (local + Blob), `auth` (jose
  sessions), `stripe`, and `email` — each wrapping one boundary. Airtable and Mux are gone.
- ✅ **Five UI primitives**, with `Button` and `ButtonLink` sharing one style module so they
  can't drift.
- ✅ **`config/env.ts`** — the only `process.env` reader.
- ✅ **`config/site.ts`** — brand facts used by landing, emails, and checkout alike.
- 🔶 **`lib/rateLimit.ts` is in-memory and therefore partial.** State lives in one serverless
  instance, so the effective limit scales with instance count and resets on a cold start.
  Documented in the module itself rather than papered over — it's a real speed bump against
  a script in a loop and nothing more. Upstash Redis is the upgrade, and a scope decision.
- 🔶 **No shadcn/ui.** CLAUDE.md §4 specifies it; these are hand-rolled. Deferred until the
  wireframe lands, since the design will decide whether shadcn's primitives fit.
- 🔶 **No React Email.** CLAUDE.md §4 specifies it; `email/shell.ts` builds HTML strings.
  Works and has no dependency cost, but templates are harder to preview and edit.
- ✅ **Resend domain verified + sending live (2026-07-30).** `baseball-sensei.com`
  is verified (DKIM + SPF on the `send.` subdomain); a real "feedback ready" email
  delivered to a Gmail inbox. `EMAIL_FROM` = `contact@baseball-sensei.com` (Google
  Workspace handles receiving). To add a new transactional email, one `api/xEmail.ts`
  using `sendEmail` + `emailShell` — see [OPERATIONS.md §8](../../OPERATIONS.md) /
  [CLAUDE.md §7](../../CLAUDE.md#7-third-party-tool-integrations).
- ✅ **Design tokens are Audrey's approved set now (2026-08-15).** `app/globals.css` carries
  the palette and type from the Figma "Final design" — blue `#313fd2`, lime `#c9f950`, a
  neutral ramp, Oswald display + Lexend body — superseding the provisional wireframe palette.
  `email/shell.ts` still mirrors the same hex values by hand, since email can't read CSS
  variables — change one, change the other.

---

## 3 · Where we came from

**Before 2026-07-28**, this was `src/lib/` (eight unrelated modules — env, site, stripe, mux,
email, fulfillment, submission-input, airtable) and `src/components/` (four). The two folders
were grouped by *tech role*: `lib` meant "not a component," which is a statement about what a
file *isn't*.

Step 2 split them by the question above. Roughly half of `lib/` turned out to be domain code
in disguise — `fulfillment` went to payment, `submission-input` to submission — and only the
genuinely domain-less remainder stayed.

Decisions taken, with their reasoning:

- **`shared/db`, `shared/storage`, `shared/auth` added; `shared/airtable` and `shared/mux`
  removed (2026-07-29).** The platform pivot ([ADR 006](../../docs/decisions/006-object-storage-over-mux.md)/[007](../../docs/decisions/007-portal-and-postgres-retire-airtable.md)/[008](../../docs/decisions/008-jose-sessions-over-authjs.md))
  swapped the Airtable REST transport for a Postgres connection, Mux for the storage seam,
  and added first-party session auth. All three stay domain-less — they know a table, a
  file, a token, never a Submission.
- **`AirtableRecord` moved down into `shared/airtable/` (Step 2).** It had been declared in
  the submission codec, which meant `shared/airtable/client.ts` imported *up* into a domain
  to type its own return values — a dependency inversion caught by the invariant check
  during the move. The raw record shape is true of any Airtable table, so it belongs on the
  floor. *(PRINCIPLES #5.)*
- **`ui.tsx` split into one file per primitive**, with the shared button styling extracted to
  `buttonStyles.ts` rather than duplicated. `Button` and `ButtonLink` render different
  elements for different reasons but are one control to the eye; the shared part is written
  once. *(PRINCIPLES #8.)*
- **`rateLimit` put in `shared/lib/`, not in the submission domain (Step 3).** Throttling a
  request is true of any endpoint — it knows nothing about submissions. Only the *policy*
  (five per minute, keyed on `status:`) lives with the route that sets it. *(PRINCIPLES #5.)*
- **`Field` gained an `error` prop (Step 3)**, replacing the hint rather than stacking under
  it — two lines of small text under one input is noise, and the error is the more urgent.
- **`Field` and `inputClass` promoted here from the start form (Step 2).** Two forms already
  used the same input styling by copy-paste, which is exactly the drift PRINCIPLES #2 exists
  to stop.
- **The best-effort email design was demonstrated under real failure (2026-07-29).** Resend
  rejected all three sends with a 403 (no verified domain). Every failure logged and
  continued: the webhooks still answered 200 and every Airtable write landed. A degraded
  email provider touched neither money nor state — which is precisely what
  [ADR 004](../../docs/decisions/004-best-effort-email.md) was arguing for, now observed
  rather than assumed.
- **Lazy env getters kept over CLAUDE.md's eager Zod parse** (original build). Flagged in
  the invariants above rather than silently reconciled — it's a real deviation from the spec,
  made for a real reason.

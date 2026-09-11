# Changelog

Every change a customer, an operator, or the next developer would want to know about — written
**in the same commit as the change**, under `Unreleased`, and moved under a version heading when the
release is cut. The shape is [`_ReleaseLaw.md` §6](laws/_ReleaseLaw.md); this project's reading of
it is [`_ReleaseDocumentation.md` §1g](documentation/_ReleaseDocumentation.md).

Sections, in this order and only when non-empty: **Added · Changed · Fixed · Removed · Security ·
Operate**. `Operate` is what someone with a dashboard must *do* for the release — a release with a
non-empty `Operate` is not deployed by pushing it. Each heading carries the schema head the release
was built against, and `· floor` when a migration in it contracts the schema, which makes the release
a rollback floor.

Written for the reader who was not there: what is different *for someone*, not what the code did.

---

## [Unreleased]

### Added

- `doctrine.json` pins this project to the doctrine pack and records each law's and template's hash;
  the doctrine gate now fails on anything edited after it was pinned (drift), so "copied verbatim" is
  checked rather than trusted.

### Changed

- **Pinned to pack v1.1.0, every law and template identical to canon.** The two local amendments —
  Structure §3a/§3b/§5b and Nomenclature's *name the shape, not the role* — went upstream and came
  back; `_NomenclatureLaw` is now the pack's generic text, with this project's words living only in
  `_NomenclatureDocumentation.md` (settled words §1, retired words §4). Pointers into the old section
  numbers were retargeted: the rename procedure is §3, nouns-vs-participles is §2b, the role test is
  §4c.
- `CLAUDE.md` §12 states the vendoring rule: nobody edits `laws/` or `templates/` in a feature PR.
- **Pinned to pack v1.2.0.** `templates/_DoctrineFeedback.md` arrives as the form (the hand-written
  `documentation/_DoctrineFeedback.md` stays as this project's instance), and `PRINCIPLES.md` §14 takes
  the pack's §15 verbatim: doctrine is earned upward and adopted downward.

- The Release Law (`laws/_ReleaseLaw.md`) and this project's instance of it
  (`documentation/_ReleaseDocumentation.md`): what a release is here, the four rungs, the promotion
  mechanism, the rollback floors, and the route from every push deploying production to a pipeline.
- This changelog.

---

## [1.0.0] — in progress · schema 0028 · floor

The first release: the go-live. Everything below is what `1.0.0` *is*, for a reader who was not here
for the build. It is cut, dated, and tagged `v1.0.0` on the day production takes real money.

### Added

- **The customer funnel**, four steps on `/start`: details → 6-digit email verification →
  multi-file upload → payment, then a confirmation and the `/status` email lookup. Payment comes last,
  so nobody pays for an upload that failed. No customer account, ever.
- **The operator portal.** The admin sees the whole queue with status filters, manages coaches and
  their languages, assigns, approves, and tunes limits and retention windows at `/admin/settings`.
  A coach downloads the pack, uploads a response, and marks it complete. A translator role handles
  the two optional translation legs.
- **The ladder and the trail.** Twenty statuses from `draft` to `purged`, eight of them only for a
  submission that needs translating, with every transition and every email recorded against the
  submission.
- **Retention.** Files are kept 30 days from the customer's first download, or 90 from delivery for a
  customer who never downloads, with a one-week warning first. A nightly sweep purges; the record of
  what was sent survives the bytes.
- **Nine transactional emails** plus the decline notice and the status access code, on Resend from
  the verified `baseball-sensei.com` domain.
- Stripe Elements embedded on our own page; uploads straight from the browser to Vercel Blob.

### Operate

- Set Stripe **live** keys (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) and create the
  live-mode webhook for `payment_intent.succeeded`, then `STRIPE_WEBHOOK_SECRET` from it. Redeploy.
- Set `CRON_SECRET`, or the retention sweep answers 503 and never runs.
- Confirm `NEXT_PUBLIC_SITE_URL` is `https://www.baseball-sensei.com` (inlined at build; a mismatch
  strands a 3-D Secure customer after they were charged).
- Clear `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` on production only, and redeploy.
- Record each coach's languages in the portal, or translation need is never detected.
- One real low-stakes purchase, end to end, then refund it in Stripe.

### Schema

- Head `0028_drop_vestigial_operator_columns`. **Floor:** `0028` drops `operator.password_hash` and
  `operator.role`, so nothing older than this release can be promoted again.

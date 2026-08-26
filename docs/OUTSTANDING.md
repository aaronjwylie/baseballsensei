# Outstanding items

A running list of what is known-missing or known-deferred. Kept here rather than
in a chat log so it survives the conversation that found each item.

**Last updated: 2026-08-15.** Add the date you resolve something, and delete the
row — git remembers.

---

## 0 · Security — act before anything else

### The Supabase Data API exposes every table to a publishable key

**Found 2026-08-15.** A `GET` against the production PostgREST endpoint with the
**publishable** (anon) key returns rows from every table checked:

| Table | Rows readable | What that is |
| --- | --- | --- |
| `operator` | 7 | every operator's email and active flag |
| `operator_credential` | 7 | **bcrypt password hashes** |
| `operator_role_grant` | 10 | who is an admin |
| `submission` | 30 | customer emails, player names and ages — **minors** — and notes |
| `submission_file` | 18 | filenames and storage locators |
| `operator_profile` | 7 | operator names and languages |
| `setting` | 1 | the operator's knobs |

Row Level Security is off, so the anon role reads everything. A publishable key
is **designed to be public** — that is what "publishable" means — so the only
thing standing between this data and anyone is that nobody has tried.

**Write access is untested.** The probe was a `PATCH` filtered to an id that
cannot exist, and the sandbox refused it. Until someone checks, assume writes
may also be open.

**Migration `0021_revoke_data_api_access.sql` now revokes `anon` and
`authenticated` privileges on deploy**, which closes this without touching RLS —
a strictly smaller blast radius, since the app's own role owns these tables and
is unaffected. That is defence in depth. **The fix is still turning the Data API
off**, and only someone with dashboard access can do it.

**The fix is unusually cheap here: turn the Data API off.** This app does not
use it. There is no `supabase-js` dependency, nothing in `src/` imports one, and
`shared/db/client.ts` talks to Postgres directly over `DATABASE_URL` through
Drizzle. The only thing reading `PROD_REST_*` is `scripts/qa.sh`, an ad-hoc
script. So:

1. **Supabase dashboard → Settings → API → Exposed schemas**: remove `public`.
   Nothing in the application notices.
2. **Then** enable RLS on every table as defence in depth
   (`ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;`). The app is unaffected: it
   connects as a privileged role, which bypasses RLS.
3. **Rotate the publishable key** afterwards, and treat the bcrypt hashes as
   having been exposed — they are hashed at cost 10, not plaintext, but the
   window is unknown.
4. Decide whether this needs disclosing. Customer emails and **the names and
   ages of children** were readable.

---

## 1 · Blocking launch

### Content and assets

| Item | Detail |
| --- | --- |
| **Masatomo's real job title** | `coach.role` in `domains/landing/model/copy.ts` still reads **"Title here"** — the Figma's placeholder, kept rather than invented. |
| **The "Why Baseball Sensei?" FAQ answer** | **Authored, not transcribed.** The Figma's version is one fragment printed twice and cut mid-clause, so there was no whole sentence to copy. Marked `AUTHORED` at the value. Needs Audrey's eye. |
| **Two more photographs** for the closing strip | The design draws six tiles; three of its six slots share one placeholder image, so four distinct photographs exist and four ship. |
| **Real coach photography** | The Figma has no photograph of Masatomo or any actual coach. `concept-panel` and `concept-round` are AI-generated stand-ins, and `coach-portrait` is a 6-up AI contact sheet, not a portrait. |
| **A native speaker should check the kanji** | One AI-generated image cell contains Japanese characters that look malformed. On a brand selling Japanese coaching credibility, garbled kanji is the worst detail to get wrong. |
| **Licence provenance for `hero-home.webp`** | A professionally-shot photograph, which usually means paid stock. Confirm the licence covers commercial web use. |
| **Light-ground logo variant** | "BASEBALL" is set in white, so the lockup only works on dark. Every ground it currently sits on is dark by arrangement, not by luck. Needs a new export, not a CSS filter. |
| **Favicon and OG image** | Neither exists in the Figma. `app/layout.tsx` declares `openGraph` metadata with no image to point at. |
| **Real terms and a privacy policy** | `/terms` is a placeholder and says so on its face. A site taking payments and storing video of minors needs both. The contact form links to a privacy policy that does not exist yet. |

### Operations

| Item | Detail |
| --- | --- |
| **Stripe production keys + live webhook** | The last thing before the funnel can take money. See `OPERATIONS.md` §5–§6. |
| **The site is behind HTTP Basic Auth** | `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`. Nothing is publicly reachable until they are cleared and redeployed. |
| **Confirm `NEXT_PUBLIC_SITE_URL`** | Must be `https://www.baseball-sensei.com` in Vercel. Inlined at build time, so a change needs a redeploy; a mismatch strands a 3-D Secure customer **after being charged**. |
| **Delete the duplicate Vercel project** | `baseballsensai` (misspelled) is wired to the same repo and **fails on every push**. Production is `baseball-sensei`, which succeeds. The failure is noise, but it is noise that looks exactly like a real broken deploy. |
| **Record each coach's languages** in the portal | Translation need is the intersection of the coach's languages and the customer's. A coach with none recorded produces "no languages recorded for this coach" rather than a prompt — correct, but the rule does nothing until someone fills them in. |
| **Revoke the Figma token** | `figd_TTJa…` was pasted into a transcript on 2026-08-15 and written to `.env.figma`. Read-only and file-scoped, but it does not expire on its own. Revoke and delete the file when the design work is done. |
| **Rotate the production DB password** | Exposed in a transcript 2026-08-05. |
| **Reactivate `ben.j.wylie@gmail.com`** | `is_active = false`, written by the operator edit form on save — an absent checkbox read as `=== "on"`. Cause fixed by Aaron in `0d6bbf0`; the row needs repairing with `docs/qa/phase-0.sql`. |
| **Confirm the admin login works in production** | `0018_repair_orphaned_logins` runs on deploy and rebuilds the missing credential and grant rows from the legacy columns. It can only recover a password that is still in `operator.password_hash`; an admin seeded with no legacy hash at all needs an explicit reset — see below. |

---

## 2 · Needs a decision

| Item | The question |
| --- | --- |
| **`site.turnaround` is now 72 hours** | Changed from 48 on 2026-08-15 to match the signed-off design, which promises 72 in the hero, the ticker and the pricing list. It is also read by the confirmation email and the status page. **If 48 was the real commitment, it changes back and the design follows.** |
| **`ink-muted` (`#818184`) is 3.88:1 on white** | Below AA for body text, used at 134 call sites app-wide. It is Audrey's own ramp step, so it has been left alone rather than quietly darkened. Her call. |
| **The kanji watermark behind the coach band** | Omitted. It is outlined artwork rather than live text in the Figma, and guessing Japanese characters off a raster render is the wrong kind of risk here. Needs the characters confirmed, or an SVG export. |
| **Form control geometry** | Buttons are square, from Audrey's own `button-*` sets. The input in the Figma is a stock Untitled-UI component (Inter, `#475467` hints) at 4px radius — not part of her system. The app's inputs are still `rounded-lg`. Worth one decision so the two agree. |
| **"Save my login details for next time"** | Drawn on the contact form in the Figma. **Not built** — it is stock Untitled-UI text, and a customer login is an explicit non-goal (CLAUDE.md §2). Confirm it was never meant literally. |
| **The flow's step numbering** | Audrey's feedback design is one page with three numbered blocks; the live flow is four steps. Her *Tell us more* is folded into our step 1 (the notes field is in the same form), her *Show your coach* becomes our 03, and verify and pay are renumbered around them. A flow showing "Step 03" third and "Step 02" fourth would be faithful to the document and wrong for the reader — but the renumbering is worth her eye. |
| **Authored copy for verify and pay** | Those two steps have no design. Their eyebrow, title and body are written in her voice and marked `AUTHORED` in `domains/checkout/model/steps.ts`. |

---

## 3 · Designed but not built

| Item | Detail |
| --- | --- |
| **Designs for the remaining routes** | The Figma covers Home, Contact and the feedback form — **all three are now built.** There is no final design for the status lookup, login/password flows, the confirmation state, or any of the operator portal — admin queue, coach desk, settings, operators. |
| **A mobile design exists and is unused** | `home-mobile` (375px) is drawn in the Figma. The build is responsive by reasoning, not by following that frame. Worth a pass against it. |

---

## 4 · Known gaps in what has shipped

| Item | Detail |
| --- | --- |
| **Nothing has been reviewed in a browser** | The landing rebuild, the contact page and the restyled flow all compile, lint, prerender and serve the right strings. No human has *looked* at them. The 375px behaviour in particular is reasoned, not observed. |
| **Accessibility unaudited** | No Lighthouse run. Token pairs were checked by hand and clear AA except `ink-muted`, above. |
| **Figma publishes no styles or variables** | Zero published styles, and the Variables endpoint returns 403. Token *names* in the codebase are ours, not Audrey's. If she publishes hers, a future sync could match them. |
| **The contact form has no rate limit** | The honeypot stops naive bots; it does nothing against someone deliberately submitting a thousand times. Worth an IP-based limit if it becomes a problem — not before. |
| **`site.email` must be a monitored mailbox** | Every contact message goes there and nowhere else, and the form now tells people a human will reply. |
| **`src/shared/lib/flowWindow.ts`** | Carries an uncommitted whitespace-only change (a stripped trailing newline) that predates this work. Left alone deliberately; it is not an improvement and not ours. |

---

## 5 · If the admin still cannot sign in

`0018` repairs operators whose legacy `operator.password_hash` survived. If one
does not have that column populated, there is no password to recover and it has
to be set. Two ways, both safe to repeat:

1. **Forgot password** at `/forgot-password`. This now works for an operator
   with no credential row, which is exactly what it could not do before.
2. **Re-run the seed against production** with `SEED_ADMIN_EMAIL` and
   `SEED_ADMIN_PASSWORD` set. It is idempotent and now self-repairing: for an
   operator that already exists it adds the credential and grant rows it is
   missing without disturbing anything else.

To check the state directly:

```sql
SELECT o.email,
       (c.operator_id IS NOT NULL)      AS has_credential,
       string_agg(g.role::text, ',')    AS grants
FROM operator o
LEFT JOIN operator_credential c ON c.operator_id = o.id
LEFT JOIN operator_role_grant g ON g.operator_id = o.id
GROUP BY o.email, c.operator_id;
```

`has_credential = false` means they cannot sign in. An empty `grants` means they
can sign in and reach nothing.

---

## 6 · Deferred by choice

Not gaps — decisions to do these later, recorded so they are not rediscovered as
bugs: an in-app `/feedback/[id]` viewer, coach deactivation UI, resumable uploads
across a reload, React Email, and shadcn/ui.

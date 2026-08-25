# Outstanding items

A running list of what is known-missing or known-deferred. Kept here rather than
in a chat log so it survives the conversation that found each item.

**Last updated: 2026-08-15.** Add the date you resolve something, and delete the
row — git remembers.

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

## 5 · Deferred by choice

Not gaps — decisions to do these later, recorded so they are not rediscovered as
bugs: an in-app `/feedback/[id]` viewer, coach deactivation UI, resumable uploads
across a reload, React Email, and shadcn/ui.

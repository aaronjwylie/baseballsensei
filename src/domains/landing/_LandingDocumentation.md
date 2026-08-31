# landing — `src/domains/landing/`

The **landing domain slice** — the sales pitch. All UI and copy; it knows nothing about
submissions and just links to `/start`.

---

## 1 · The northstar

A parent arrives cold, having never heard of us, and has to decide whether to hand $80 to
strangers overseas. The page's whole job is closing that gap.

**Section order is the argument**, and `ui/LandingPage.tsx` is where it's made:

| # | Section | Doing what |
|---|---|---|
| 1 | `Hero` | the hook — what this is, in one line |
| 2 | `Ticker` | the proofs, at a glance |
| 3 | `HowItWorks` | the process, demystified |
| 4 | `Coach` | who's actually watching your kid's video |
| 5 | `Pricing` | the ask, with the value beside the number |
| 6 | `Faq` | the objections |
| 7 | `Closing` | why it matters, once the arguing is done |
| 8 | `FinalCta` | the ask again, for scrollers |

Eight sections, matching Audrey's Figma, page **"Final design"**
(file `nZ2cQxvViIVzxrA9ILchVt`). The bands alternate ground — dark, blue, light, dark, blue,
light, dark — and no two adjacent sections share a background, which is what keeps a page
this long from reading as one column.

### The invariants

- **Copy is data, never JSX.** Every word the client might change lives in `model/copy.ts`
  or `shared/config/site.ts`. A section component maps over a value; it never contains a
  sentence. This is what makes "the admin wants to reword the FAQ" a one-file change by someone
  who doesn't write React.
- **The split between the two copy homes is by scope, not convenience.** Facts true of the
  whole business — name, price, turnaround — are in `shared/config/site.ts`, because the
  emails and checkout need them too. Facts true only of this page are here. *(PRINCIPLES #5
  — the highest node where it's still true.)*
- **Speed and price are derived, never typed twice.** The ticker, the hero body, the pricing
  list and the FAQ all interpolate `site.turnaround`; the price on the card is read from the
  `settings` row the admin edits. The page physically cannot promise something different
  from what the system does.
- **A heading's two colours are a copy decision.** `SplitHeading` stores `lead` and
  `highlight` separately, so moving the emphasis is done by moving a word across in
  `copy.ts`, not by editing markup.
- **Every call to action goes to `/start`** — the live paid flow, not an anchor.
- **This slice imports one other domain: `settings`**, and only for the price. That import is
  also why `index.ts` exports a deliberately narrow, server-only surface — the page and the
  `faqPageSchema` structured-data object, and no copy objects. The barrel now reaches database
  code, and a client component importing it would pull Postgres into the browser bundle.

---

## 2 · Where we are now — 2026-08-15

Rebuilt from Audrey's Figma. The approved wireframe that preceded it
(`docs/reference/Home • Desktop.svg`) is superseded and no longer describes anything in the
code.

- ✅ **Eight sections**, responsive down to 375px, composed in `ui/LandingPage.tsx`.
- ✅ **Copy transcribed from the Figma** into `model/copy.ts`, signed off by Ben 2026-08-15.
- ✅ **The palette has a hue.** Two brand colours — blue `#313fd2` and lime `#c9f950` — and a
  six-step neutral ramp, in `app/globals.css`. `--color-accent` is the blue and keeps its old
  meaning (links, focus rings, primary fill); lime is `--color-highlight` and never appears
  as text on paper, where it measures 1.22:1.
- ✅ **Oswald + Lexend**, replacing the Jost guess. Headings and button labels are Oswald;
  running text is Lexend. This closes the `TODO(2026-07-30, Ben)` that asked for the face.
- ✅ **Real photography** — 15 assets exported from the Figma, resized and re-encoded to WebP
  (33.8 MB → 876 KB), in `public/images/`.
- ✅ **The real logo**, replacing the type-only wordmark.
- ✅ **The price is live**, read from `settings` rather than transcribed, which is what makes
  `/` an ISR page (`revalidate = 300`) rather than a static one.
- ✅ **Smooth-scroll anchors** (`#how-it-works`, `#coaches`, `#pricing`, `#faq`).
- ✅ **The page has since been through browser QA.** The 2026-08-15 rebuild shipped unseen; the
  QA board has since exercised it in a browser and closed the observed defects — the hero
  "How it works" button not scrolling, the ticker gap on ultra-wide screens (QA 1.1.3), the
  FAQ toggle riding high in its circle, and the JSX trailing-space loss on `/status` (QA 5.13.11).
  The 375px pass is still lighter than the desktop one.
- 🔶 **`coach.role` is still "Title here"** — the Figma's placeholder, kept rather than
  invented, because making up a job title for a real named person is not a gap code fills.
- 🔶 **One FAQ answer is authored, not transcribed.** The Figma's "Why Baseball Sensei?"
  answer is one fragment printed twice and cut mid-clause, so there was no complete sentence
  to copy. Marked `AUTHORED` at the value. **Needs Audrey's eye.**
- 🔶 **The closing strip ships 4 tiles where the design draws 6** — three of its six slots
  share one placeholder image. Two more photographs would fill it.
- 🔶 **The decorative kanji watermark behind the coach band is omitted.** It is outlined
  artwork rather than live text in the Figma, and guessing Japanese characters off a raster
  render is the wrong kind of risk on a brand selling Japanese coaching.
- 🔶 **The logo is light-on-dark only.** "BASEBALL" is set in white, so every ground it sits
  on has to be dark — which is why the interior header is ink rather than paper. A
  light-ground variant needs a new export, not a CSS filter.
- ✅ **SEO foundation is in** (2026-08-29). A generated OG share card (`app/opengraph-image.tsx`),
  a generated lime favicon (`app/icon.tsx`), `robots.ts`, `sitemap.ts`, richer `openGraph`/Twitter
  metadata and self-referencing canonicals in `app/layout.tsx`, plus JSON-LD — an
  Organization + WebSite + Service/Offer graph in `shared/seo`, and a `FAQPage` built from the
  same `faqs` this page renders (`model/schema.ts`, exported as `faqPageSchema`). It ships
  ready for when the Basic Auth launch gate lifts.
- 🔶 **Accessibility unaudited** — no Lighthouse run. Token pairs were checked by hand and all
  clear AA except `ink-muted` on paper at **3.88:1**, which is Audrey's own ramp step and is
  used at 134 call sites app-wide.
- 🔶 **`/terms` is a placeholder, not legal copy**, and says so on its face. A site taking
  payments and storing video of minors needs real terms and a privacy policy before launch.

### Departures from the Figma, and why

Each of these is a deliberate choice, not an oversight. **All want Audrey's sign-off.**

| Figma | Built | Why |
| --- | --- | --- |
| Eyebrow set in lime on the `#f2f2f2` coach band | Blue | Lime on that ground is ~1.2:1 and effectively invisible. Same token, different ground, different answer. |
| Step badges all read "1" | 1, 2, 3 from the array index | A paste artefact, not a statement about ordering. Derived numbers can't disagree with the order the steps are read in. |
| Claim strip is a static row, its 7th item a repeat of the 5th | A marquee of 6 | The row needs 7 items to fill 1079px and can't fit 6 at 375px. The accidental repeat becomes the deliberate loop; motion is off under `prefers-reduced-motion`. |
| Price written as "80$" | `$80` via `formatPrice` | en-CA, matching the receipt email and the payment step. Two spellings of one amount on a single purchase is a support ticket. |
| Price written at all | Read from `settings` | Transcribing means the page keeps quoting the old figure the moment the admin changes it. |
| "within 72 hours" in three places; `site.turnaround` said **48** | **72 hours** everywhere | The two could not both stay — the value is read by the confirmation email and the status page as well. Changed 2026-08-15; if 48 was the real commitment, the design has to follow. |
| Buttons at 4px radius on the stock input component | Square, 2px border | Audrey's own `button-*` sets are square. The 4px input is a stock Untitled-UI component (Inter, `#475467` hints) dropped in for layout — not part of her system, so it gets no vote on the brand's control shape. |
| FAQ drawn with the first row open | Same, via `<details open>` | Native disclosure: keyboard support, expanded-state announcement and find-in-page come free, and the section ships no JavaScript. |
| Closing strip a single row of 6 | 2-up grid at mobile, 4 across from `sm` | Four tiles across a phone are unreadably narrow. |
| No status link anywhere | "Check status" kept in the footer | A customer who has paid has no account by design, so the email lookup is their only route back to a submission. Dropping it would strand them. |

### Resolved since the last revision

**The "Written summary of notes" conflict is gone.** It was flagged here because a submission
carried exactly one `feedbackUrl`, so a coach could deliver a video *or* a document, not both.
The response is now rows in `submission_file` with kind `response`, so the pricing card's
claim is backed by the pipeline. No copy change needed.

Still open from that group: **`site.email` is `contact@baseball-sensei.com`**, and `/contact`
depends on that mailbox existing.

---

## 3 · Where we came from

**Before 2026-07-28**, the entire landing page was a **344-line `src/app/page.tsx`** holding
eight section components, two icon components, and a shared heading component in one file,
with copy in `lib/site.ts` mixed together with app-wide brand facts.

Decisions taken, with their reasoning:

- **Copy externalized from the start** (original build). Kept, and it's the single best
  decision in the pre-existing code — it's why three consecutive design rebuilds could replace
  every component without losing a word of marketing copy.
- **Split into one file per section (Step 2).** The monolith was about to collide head-on
  with the wireframe work: eight sections in one file means every design change touches the
  same file, and any parallel work conflicts. Sections are also the unit Audrey thinks in,
  so the file boundaries match the conversation boundaries.
- **`site.ts` split in two (Step 2).** It had been holding both app-wide facts (name, price)
  and landing-only copy (coach bios, FAQ). The emails imported it for the price and got the
  FAQ in the bundle. Facts moved to `shared/config/site.ts`; page copy stayed here.
- **Restructured to a greybox reference wireframe (2026-07-29).** `TrustStrip` and
  `WhatYouGet` were deleted and their value proposition folded into the pricing card. That
  reference is now superseded, but the fold survived it — both later designs do the same thing.
- **Rebuilt to Audrey's approved wireframe (2026-07-30).** The change of substance is the
  coach section: three equal coach cards became **one lead coach with his team behind him**,
  which is the stronger argument — a parent is trusting a person, not a roster.
- **Palette retuned in `globals.css` rather than added alongside (2026-07-30).** The token
  names didn't change, so the swap re-skinned the whole app in one file — the mechanism the
  token layer existed for.
- **Rebuilt to Audrey's Figma (2026-08-15).** The design system arrived with values but no
  names: the file publishes zero styles and its Variables endpoint is closed to us, so the
  tokens were read off a `Colours+typography` board and **named by us**, not adopted. Three
  values in the file were excluded as Figma furniture rather than design — `#9747ff`
  (component-set boundary strokes), `#fee8a2` (sticky notes) and the Nunito face (annotation
  labels only). `Chip`, `MediaFrame`, `StickerCard`, `UseCase` and `FooterCta` were deleted;
  `Ticker`, `Closing` and `FinalCta` are new. `SectionHeading` survived but changed shape,
  from an eyebrow-plus-title to the two-tone `SplitHeading` the design uses five times.
- **The header learned two grounds (2026-08-15).** The design floats it over the hero
  photograph on `/` and there is no photograph anywhere else, so `SiteChrome` picks the
  transparent variant for the landing page and the ink one everywhere else. Both are passed
  in as props from the root layout rather than having `SiteChrome` import `SiteHeader`,
  which would have pulled a server component into a client one.
- **`navLinks` promoted to `shared/layout/`.** The header and the footer both render it, and
  two copies of one list is how a renamed section goes missing from one of them. The Figma's
  own nav matches it exactly, which is a good sign for the split.
- **SEO foundation landed (2026-08-29).** The site had per-page titles and descriptions and
  nothing else. Added crawl control (`robots.ts`, `sitemap.ts`), a generated OG card and
  favicon, richer discovery metadata with self-referencing canonicals, and JSON-LD structured
  data. The landing slice's part is `faqPageSchema` (`model/schema.ts`), a `FAQPage` graph
  built from the same `faqs` array the section renders — one source, so the search rich result
  can't disagree with the page. Its follow-up (2026-08-29) dropped the em dashes from three FAQ
  answers, which were surfacing in that rich result.

# contact — `src/domains/contact/`

The **contact domain slice** — one form, one message, no storage.

---

## 1 · The northstar

Someone who is not yet a customer has a question, and the answer decides whether
they buy. The slice exists to get their words in front of a human and to be
honest about whether that worked.

**It stores nothing.** There is no table, no queue, no retry. A contact message
is not a record we keep; it is a mail we hand off. That single fact decides
almost everything else in here.

### The invariants

- **Validated by one schema, twice.** `model/contactInput.ts` runs in the
  browser for instant feedback and again inside the server action, because
  anything can POST to a server action. The client half is a courtesy, never a
  control.
- **The send is not best-effort, and that is deliberate.** ADR 004 makes email
  best-effort so a mail hiccup can't fail a Stripe webhook or a portal
  mutation — work that already happened, where the mail is a *notification*.
  Here the mail **is** the work. If it doesn't leave, nothing happened, and
  "thanks, we'll be in touch" would be a lie somebody waits on. So the action
  reports the failure and the form says so. This is the same reasoning that
  makes ① the verification code fail its flow.
- **Every interpolated value is escaped.** The name and the message are exactly
  the fields a spam bot fills with markup, and they land in HTML in somebody's
  inbox. `escapeHtml` lives in `shared/email` for this reason — it used to be a
  private function in `paymentEmail.ts` with an instruction to copy it, and a
  copied security control is one a future template forgets.
- **`replyTo` carries the writer's address.** The mail is *from* the brand like
  every other message the app sends, so without it the natural gesture — hit
  reply — answers ourselves.
- **No customer identity, ever.** The form takes a name and an address to reply
  to. It does not create an account, and it does not remember anyone.

---

## 2 · Where we are now — 2026-08-27

Built from Audrey's Figma (`nZ2cQxvViIVzxrA9ILchVt`, frame `15385:17951`).

- ✅ **The form**: first name, last name, email, message, consent — on the dark
  ground the design puts it on.
- ✅ **Spam control**: a honeypot field, positioned off-screen rather than
  `display: none` because some bots skip hidden inputs specifically, and marked
  `aria-hidden` with `tabIndex={-1}` so nobody reaches it by accident. A filled
  honeypot answers `ok: true` **without sending** — a bot told it failed retries;
  one told it succeeded goes away.
- ✅ **Success replaces the form**, so a filled form can't sit under a "sent!"
  banner inviting a second identical send.
- ✅ **The consent line links to `/privacy`**, a real page now (#22,
  2026-08-27) — the design's "our friendly privacy policy" is honoured. It was a
  `/terms` placeholder when this slice was built.
- 🔶 **No rate limit.** The honeypot stops naive bots; it does nothing against
  someone deliberately submitting the form a thousand times. Worth an IP-based
  limit if it ever becomes a problem — not before.
- ✅ **Every message goes to `listAdminEmails()`** — the admin operators plus
  the shared `contact@` inbox, the same recipient list a coaching submission's
  arrival notice uses (QA 1.2.8, 2026-08-27) — so a message reaches whoever the
  team has watching. Receiving is Google Workspace on the root MX, independent of
  Resend, so a reply reaches the `contact@` inbox. Each of those addresses must
  be real and monitored.

### Departures from the Figma

| Figma | Built | Why |
| --- | --- | --- |
| A **"Save my login details for next time"** checkbox | **Not built** | It is stock Untitled-UI text that came in with the component, and a customer login is an explicit non-goal (CLAUDE.md §2). There is nothing to save and nothing to log into. |
| Hint text under every field reading *"This is a hint text to help user."* | Dropped | Placeholder from the same stock component, not copy. |
| Field labels and hints set in **Inter** | Lexend | Inter arrived with the stock input component; it is not in Audrey's type system, which is Oswald and Lexend. |

---

## 3 · Where we came from

`/contact` was a **mailto stub**, and deliberately so. Its comment read: a form
"needs a route, validation, spam handling, and somewhere for the message to
land, and none of that is worth building before anyone has written in."

That was right when it was written. All four now exist, so the reason expired
rather than being overruled — which is the difference between removing a
placeholder and overriding a decision.

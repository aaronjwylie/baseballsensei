# account — the ability to sign in

## The northstar

**An operator is a person in the business; an account is a capability granted to
them.** This domain owns the second: one table, `operator_credential`, and the
operations on a secret.

A coach can exist before anyone gives them a login. Until 2026-08-06 the schema
could not say that — `password_hash` was a column on the operator row, so the
two nouns shared a record and neither could be described without the other.

Invariants:

- **`api/credentialApi.ts` is the only file in `src/` that reads or writes
  `password_hash`**, and the only one that imports bcrypt. One grep confirms it.
- **`operator` imports `account`'s barrel. `account` never imports `operator`'s** —
  it reaches `operatorTable` at the declaration plane and nothing else. That
  direction is the whole design; see below.
- **The secure check lives here and is done close to the data** (`api/dal.ts`, in
  the page or action). `proxy.ts` is optimistic and never the sole defence.
- **A wrong-role operator is redirected to *their* portal**, not to `/login` —
  they are authenticated, just in the wrong place.

## Everything about signing in moved here — 2026-08-06

The first version of this domain kept only the credential table and its
primitives, and left login, the DAL and the forgot-password flow in `operator`
on the reasoning that they "start from an email".

**That was a kind-3 placement dressed as a kind-1 constraint**
([`_StructureLaw` §3c](../../../laws/_StructureLaw.md)). Nothing broke either
way; the hash was already contained. The honest question was only *where would
someone look for the login flow* — and the answer is "account".

So the whole surface is here:

```
model/role.ts                  ROLES · HOME_FOR_ROLE · CAN_BE_ASSIGNED · OperatorSession
model/operatorRoleEnum.ts      the DB enum, beside the vocabulary it derives from
model/credentialTable         the secret
api/dal.ts                     requireSession · requireRole — the secure check
api/auth.ts                    login · logout · changePassword
api/loginApi.ts                the two acts needing a person *and* a secret
api/passwordReset*.ts          the forgot-password flow
ui/                            all four password/login forms
```

**`Role` came here first, and went back.** The argument for keeping it was that
what a role *decides* is access — which portal you land in, what a guard lets
through. The better argument won: **a role is not a permission, it is a kind of
operator**, and adding one adds a kind of person to the business. It belongs
beside the table whose column it types.

What stayed is genuinely this domain's: **what a session carries**
(`OperatorSession`) and **where signing in sends you** (`HOME_FOR_ROLE`).
`CAN_BE_ASSIGNED` went to `operator`, because being given work is not access.

**The vocabulary lives in `operatorRoleEnum.ts` — the declaration — on purpose.**
This domain needs `Role` for the session payload, and `operator` imports this one
for its guards and credentials; an ordinary model import would have closed a
cycle. A declaration is reachable from anywhere (§5.7), so putting the list there
gives this domain a legal door to the one word it needs while the vocabulary
stays where a reader would look for it. Still one list, two consumers — it simply
sits on the plane both planes can see.

## Why the direction is one-way — 2026-08-06

Two acts need a fact from both sides: **signing in** (an email → a person, then
a secret → a yes) and **creating a login** (a person, then a secret). They
compose in `api/loginApi.ts`, here.

**`account` reads `operatorTable` at the declaration plane** to answer "which
operator has this email". That is the sanctioned route (`_StructureLaw` §5.7) and
it is what keeps the graph one-way: going through `operator`'s barrel instead
would close a cycle, since `operator` depends on this for `requireRole` and for
the password it sets when an admin adds a coach.

**`check:structure` caught exactly that cycle mid-refactor** — `loginApi` had
imported `Operator` to describe its return value. It has its own `Authenticated`
shape now, which is the same three fields and a genuinely different question:
`Operator` is the record an admin edits, `Authenticated` is the answer to *did
this secret belong to somebody*.

## What this cost, and why it was worth it

The split needed a schema change, and that is the point. The rules said two
concerns sharing a table cannot be two domains — which was true, and was
mistaken twice for an architectural conclusion when it was a **schema decision
nobody had questioned** ([`_StructureLaw` §5b](../../../laws/_StructureLaw.md)).

It is also better schema independently of folders: every `SELECT *` on an
operator was carrying a password hash into memory for a column almost nothing
reads.

## Where we are now — 2026-08-06

- ✅ `operator_credential` created and backfilled (`0013`) — verified 10 rows to
  10, zero drift between the old column and the new table.
- ✅ `password_hash` on `operator` made nullable (`0014`), so a new operator no
  longer writes it.
- 🔶 **The old column still exists.** Deliberate: migrations run *before* the
  build, so for a few seconds the previous deploy serves against the new schema.
  Dropping it in the same step is the 2026-08-02 outage exactly. A follow-up
  contracts it once `0013`/`0014` are live.
- ❌ **No `updatedAt` is surfaced anywhere.** The column exists and is written;
  nothing shows an admin when a password last changed, which is the first thing
  this table makes cheap and is worth doing when the portal grows a security
  view.

### The 2026-08-15 outage: a login that could not be used

**Nobody seeded after 2026-08-06 could sign in, and resetting their password
made no difference.** Worth writing down in full, because every individual piece
was correct.

`0013` moved the hash into `operator_credential` and `0015` moved the role into
`operator_role_grant`. Both backfilled the operators that existed when they ran,
so everyone already in the database kept working and the change looked complete.

`scripts/seed.ts` was not updated with them. It went on writing one `operator`
row carrying `password_hash` and `role` — columns the login path had stopped
reading, and which still exist because the expand-only step deliberately kept
them. So the row looked complete, `tsc` was satisfied, and `verifyCredentials`
found no credential and returned `null`. The login page reports that as an
invalid password, which is the one explanation that sends someone to reset it.

Resetting it did nothing, and said so to nobody. `setOperatorPassword` was
`UPDATE … WHERE operator_id = $1`, and **an UPDATE that matches no row succeeds**
— zero rows changed is not an error. Both reset paths reported success over a
password that had not moved.

Three fixes, because the bug had three halves:

1. **`setOperatorPassword` upserts.** There is no caller for whom "change it if
   a row exists, otherwise quietly do nothing" was the intent.
2. **The seed writes the credential and the grant**, and repairs those rows when
   re-run against an operator that predates the fix.
3. **`0018_repair_orphaned_logins`** re-runs both backfills for whoever is still
   missing them — the half no new code can reach, since the broken rows already
   exist in production.

Fixing (1) made `setOperatorPassword` and `createCredential` identical, so they
now share one private `writeCredential`. Two copies of one write is how one gets
corrected later and the other doesn't, which is the shape of this bug.

**What would have caught it:** nothing that existed. `tsc` was happy — the
legacy columns are still declared. The simulation was happy — it granted roles
through the domain functions, which write the right rows. `scripts/simulate.ts`
now asks the login path itself, from the outside, whether a freshly created
operator can actually sign in and whether a reset actually changes a password.
Reverting either fix turns those checks red.

## Where we came from

- **Before 2026-08-06** — `password_hash` was a column on `operator`. The
  containment was real but conventional: one file read it, said so in its
  docblock, and nothing enforced the claim across a folder boundary because
  there was no boundary to cross.
- **2026-08-06, earlier the same day** — `operatorApi.ts` split into record and
  credentials, which made the hash's containment a *file* boundary. This is that
  same decision carried to its end: a table, a domain, and a dependency that
  points one way.

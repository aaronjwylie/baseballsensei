/**
 * Which kinds an operator is — **one row per role they hold.**
 *
 * A person is not one kind of operator. Ben runs the platform *and* coaches; a
 * coach who reads both languages is also the translator for their own
 * submissions. Until 2026-08-07 `operator.role` was a single column, so the
 * only way to be two things was two logins with two email addresses — which is
 * how the need surfaced: the same person could not be onboarded twice.
 *
 * ## Why a table rather than an array column
 *
 * A grant is **a privilege change**, and the two questions you eventually ask
 * about one are *who did this* and *when*. An array of roles on the operator
 * answers neither, and cannot be made to without becoming a table.
 *
 * That shape then earned itself twice over: `languages` and `specialties` moved
 * here from the profile in 2026-08-30, because they are per-role facts that had
 * been sharing one value per person.
 *
 * That is the whole reason for `grantedBy`. Nothing reads it yet.
 *
 * ## The shape
 *
 * The primary key is the pair, so holding a role twice is not representable —
 * the constraint does the work a `DISTINCT` would otherwise have to.
 *
 * `grantedBy` is **nullable and means something when null**: the seeded first
 * admin was granted by nobody, and a backfilled row predates the question. It
 * is `set null` on delete rather than cascade, because removing the operator
 * who granted a role must not remove the role.
 *
 * `grantedAt` uses `clock_timestamp()`, not `now()` — see
 * `submissionEventTable` for the day that distinction cost us.
 */
import {
  pgTable,
  uuid,
  timestamp,
  boolean,
  text,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { operatorTable } from "./operatorTable";
import { operatorRole } from "./operatorRoleEnum";
import { focus } from "@/domains/submission/model/focusEnum";

export const operatorRoleGrantTable = pgTable(
  "operator_role_grant",
  {
    operatorId: uuid()
      .notNull()
      .references(() => operatorTable.id, { onDelete: "cascade" }),
    role: operatorRole().notNull(),
    /**
     * Available for **this kind** of work.
     *
     * Per-grant rather than per-operator, because the two are genuinely
     * independent: someone can be a coach who is taking submissions and a
     * translator who is not, or paused on both while still being an admin. A
     * single flag on the operator could not say that.
     *
     * Distinct from `operator.isActive`, which is whether they may sign in at
     * all. Suspending an account and pausing one kind of work are different
     * decisions, made for different reasons, by possibly different people.
     */
    isActive: boolean().notNull().default(true),
    /**
     * Whether this role's holder wants the emails it generates — **admin only,
     * in practice** (Ben, QA 5.13.6.2).
     *
     * An admin cannot be paused: their authority is `isActive` on this grant,
     * which login reads to decide they *are* an admin, so muting notifications
     * could never ride on it without also removing the role. This is the
     * separate switch — the person stays a full admin and simply stops getting
     * their own copies of the submission and system mail. The shared `contact@`
     * inbox is always a recipient regardless, so nothing goes unseen when an
     * admin opts out. Defaults on; a coach or translator carries it but nothing
     * reads it for them yet.
     */
    notify: boolean().notNull().default(true),
    /**
     * What they read, **for this role**.
     *
     * Moved off `operator_profile` on 2026-08-30. One person had one list, so a
     * coach who reads English and Japanese was necessarily a translator who
     * works between English and Japanese — the same fact standing in for two
     * different ones. They are not the same: a coach's languages decide whether
     * a submission needs translating at all, and a translator's decide which
     * legs they can take. Someone can coach in one language and translate
     * between two others.
     *
     * Empty is meaningful and common: an admin has no languages because the
     * question does not apply to running the platform.
     */
    languages: text().array().notNull().default([]),
    /**
     * Which focuses this role covers — Hitting, Pitching and the rest.
     *
     * Per-role for the same reason: a coach's specialties are what they will be
     * assigned to review; a translator's are the vocabularies they are fluent
     * in. A person can be both without those two lists agreeing.
     */
    specialties: focus().array().notNull().default([]),
    /**
     * The public blurb and photograph — **coach only**, in practice.
     *
     * They live here rather than on the person because they exist *because of*
     * the role: a coach is shown on the public site, an admin and a translator
     * are not. Putting them on the operator made "is this person public?" a
     * question you answered by checking a different table.
     *
     * Consequence, stated plainly: removing a coach role discards that role's
     * bio and photo. That is the intended reading — the public presence exists
     * because the role does — and it is why pausing exists as the reversible
     * act. Removing a role is meant to be deliberate.
     */
    bio: text(),
    imageUrl: text(),
    grantedAt: timestamp({ withTimezone: true })
      .default(sql`clock_timestamp()`)
      .notNull(),
    /** Who granted it. Null for the seeded admin and for backfilled rows. */
    grantedBy: uuid().references(() => operatorTable.id, {
      onDelete: "set null",
    }),
  },
  (table) => [primaryKey({ columns: [table.operatorId, table.role] })],
);

export type OperatorRoleGrantRow = typeof operatorRoleGrantTable.$inferSelect;

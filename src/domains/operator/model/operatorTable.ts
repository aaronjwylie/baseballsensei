/**
 * **An operator is someone who logs in.** That is the whole definition.
 *
 * Admin, coach and translator all live here, told apart by `role`. What sits on
 * this table is what's true of *everyone* who signs in: a way to identify them,
 * a way to prove it, a name to show, and whether they still may.
 *
 * The rest — languages, bio, photo, specialties — is true only of the people who
 * take assigned work and appear on the website, and lives beside this in
 * `operatorProfileTable`. **An admin has no profile row**, which is the point: an
 * empty `languages` on one shared table couldn't distinguish "this is an admin"
 * from "nobody has filled this coach in yet" (ADR 018).
 *
 * Operators only, never customers — a customer is an email on a submission and
 * has nothing here. There is no self-signup either: the first `admin` is seeded
 * (`npm run db:seed`), and every other operator is created from the admin portal.
 */
import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const operatorTable = pgTable("operator", {
  id: uuid().defaultRandom().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  /*
    Whether they may still sign in and be given work.

    It lived on the coach record, where deactivating someone left their login
    working — the toggle said one thing and did another. Here it gates what it
    sounds like it gates.
  */
  isActive: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type OperatorRow = typeof operatorTable.$inferSelect;

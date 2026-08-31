/**
 * The kinds of operator there are — **the vocabulary and its DB spelling, in
 * one file.**
 *
 * A role is not a permission. It is *what kind of operator someone is*, and
 * adding one means adding a kind of person to the business — so it belongs to
 * `operator`, beside the table whose column it types.
 *
 * ## Why the list lives in the declaration
 *
 * `account` needs `Role` for the session payload, and `operator` imports
 * `account` for its guards and its credentials. If the vocabulary sat in an
 * ordinary model file, that second import would close a cycle
 * (`_StructureLaw` §5.3).
 *
 * A **declaration** is reachable from anywhere — it is where tables and enums
 * are read from uniformly, whoever is asking (§5.7). Putting the list here
 * gives `account` a legal door to the one word it needs, and keeps the whole
 * role vocabulary in the domain the user of this codebase would look in.
 *
 * Still one list with two consumers; it simply lives on the plane that both
 * planes can see.
 */
import { pgEnum } from "drizzle-orm/pg-core";

export const ROLES = ["admin", "coach", "translator"] as const;

export type Role = (typeof ROLES)[number];

export const operatorRole = pgEnum("operator_role", ROLES);

/**
 * "a coach", "a translator", "an admin", "an operator".
 *
 * One helper because the article was being chosen in two places and got it
 * wrong in both: a template literal wrote "Add a admin", and a button wrote
 * "Add admin" with no article at all.
 *
 * **A vowel test, not a general one.** English articles are irregular — "a
 * university", "an hour" — and no short function gets those right. This is
 * correct for the four nouns this application actually has, and would need
 * revisiting rather than trusting if a role were ever named something like
 * "editor-in-chief". Naming the limit here is cheaper than discovering it in
 * a label.
 */
export function withArticle(noun: string): string {
  const article = /^[aeiou]/i.test(noun) ? "an" : "a";
  return `${article} ${noun}`;
}

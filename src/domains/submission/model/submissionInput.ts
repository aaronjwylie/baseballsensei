/**
 * The shapes a customer can type, and what counts as valid.
 *
 * **These schemas are the single home for that question.** The client form
 * validates with them and the API route re-validates with the same object, so
 * the two cannot drift into disagreeing about what's acceptable — which is the
 * whole reason for a shared schema rather than two hand-rolled checks.
 *
 * Property names match the domain model in `./submission.ts`: the form field,
 * this payload, the Stripe metadata key, and the Airtable column all use the
 * same word for the same thing.
 *
 * Server-side re-validation is not optional. Client validation is a courtesy to
 * honest operators; anyone can POST directly.
 */
import { z } from "zod";
import {
  FOCUS_OPTIONS,
  LANGUAGE_CHOICES,
} from "./submission";

const MIN_NOTES_LENGTH = 20;
const MAX_NOTES_LENGTH = 4000;
const MAX_EMAIL_LENGTH = 254;
const MAX_PLAYER_NAME_LENGTH = 120;
const MIN_PLAYER_AGE = 1;
const MAX_PLAYER_AGE = 99;

/**
 * An email address we're willing to accept.
 *
 * One home for the question — checkout and the status lookup both ask it, and
 * two definitions would drift into accepting different things.
 *
 * **Normalize before validating, not after.** Mobile keyboards routinely append
 * a space after an autocompleted address, and `z.email()` rejects
 * `"alex@x.com "` outright — so trimming in a trailing `.transform()` would
 * reject real customers before it ever got the chance to clean their input.
 * Hence `.trim().toLowerCase().pipe(...)`.
 *
 * Lowercased because Airtable's formula comparison is case-sensitive: a
 * customer who checks out as `Alex@x.com` and later looks up `alex@x.com` must
 * find their own submission.
 */
export const customerEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email("Please enter a valid email address.")
      .max(MAX_EMAIL_LENGTH, "That email address is too long."),
  );

/** Just the email — the status lookup's entire payload. */
export const lookupSchema = z.object({
  customerEmail: customerEmailSchema,
});

export type LookupInput = z.input<typeof lookupSchema>;

/**
 * Age is optional, but a value that *was* supplied and isn't a plausible age is
 * a typo worth surfacing rather than silently dropping — the coach uses it to
 * pitch their feedback.
 *
 * Empty string coerces to `undefined` rather than 0, since an untouched
 * optional text input submits `""`.
 */
const playerAgeSchema = z
  .union([z.literal(""), z.coerce.number()])
  .optional()
  .transform((value) => (value === "" || value === undefined ? undefined : value))
  .pipe(
    z
      .number()
      .int("Please enter the player's age as a whole number.")
      .min(MIN_PLAYER_AGE, "Please enter a valid age.")
      .max(MAX_PLAYER_AGE, "Please enter a valid age.")
      .optional(),
  );

/** Everything collected before payment. */
export const submissionInputSchema = z.object({
  customerEmail: customerEmailSchema,

  playerName: z
    .string()
    .trim()
    .min(1, "Please enter the player's name.")
    .max(MAX_PLAYER_NAME_LENGTH, "That name is too long."),

  playerAge: playerAgeSchema,

  // An unselected <select> submits "", which means "not sure / general" —
  // absence, not an error.
  focus: z
    .union([z.literal(""), z.enum(FOCUS_OPTIONS)])
    .optional()
    .transform((value) => (value === "" ? undefined : value)),

  customerNotes: z
    .string()
    .trim()
    .min(
      MIN_NOTES_LENGTH,
      `Please add at least ${MIN_NOTES_LENGTH} characters so your coach knows what to look at.`,
    )
    .max(MAX_NOTES_LENGTH, `Please keep notes under ${MAX_NOTES_LENGTH} characters.`),

  /*
    What the customer reads — the same three-way choice the coach form asks,
    defaulted to English rather than Japanese.

    Checkboxes here first, which could be unticked to nothing and needed a
    `.min(1)` and an error message to catch it. A radio group has no empty state
    to catch: the answer the intersection can't use is simply not expressible,
    and `.catch` covers a post that didn't come from the form.
  */
  /*
    **No `.transform` here, and that is the whole point** (Ben, QA 5.9.2,
    2026-08-31).

    It used to widen the choice into a `string[]`, which made the schema
    non-idempotent: its own output was no longer valid input. That matters
    because this schema is parsed **twice** — once in the browser by
    `zodResolver`, whose transformed output the form then sends, and again on
    the server, which must never trust the client. The second parse received
    `["Japanese"]`, the enum rejected an array, and `.catch("English")` turned
    that into a silent, confident wrong answer.

    Every submission ever created came out `["English"]` regardless of what the
    customer picked, and nothing anywhere failed. The `.catch` is what made it
    silent — which is worth remembering about `.catch` in general: it converts a
    shape error into plausible data, so it belongs only where the schema cannot
    disagree with itself.

    Widening is now the caller's job, once, on the server, next to the insert.
    A schema that is applied twice has to be a function that can be.
  */
  languages: z.enum(LANGUAGE_CHOICES).catch("English"),
});

/** What the form collects, before parsing — every field a string. */
export type SubmissionInputDraft = z.input<typeof submissionInputSchema>;

/** What the server acts on, after parsing. */
export type SubmissionInput = z.output<typeof submissionInputSchema>;

export type ParseResult =
  | { ok: true; value: SubmissionInput }
  | { ok: false; error: string };

/**
 * Parse an untrusted payload, surfacing the **first** problem as one sentence.
 *
 * The API returns a single message rather than a field map because the client
 * form already shows per-field errors inline; by the time a request reaches the
 * server with bad data, the caller isn't using our form.
 */
export function parseSubmissionInput(raw: unknown): ParseResult {
  const result = submissionInputSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };

  const first = result.error.issues[0];
  return {
    ok: false,
    error: first?.message ?? "Please check the form and try again.",
  };
}

/** Parse a status-lookup payload. Same contract as above. */
export function parseLookupInput(
  raw: unknown,
): { ok: true; customerEmail: string } | { ok: false; error: string } {
  const result = lookupSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, customerEmail: result.data.customerEmail };
  }

  const first = result.error.issues[0];
  return {
    ok: false,
    error: first?.message ?? "Please enter a valid email address.",
  };
}

import { z } from "zod";

/**
 * What the contact form collects, validated once and read by both sides.
 *
 * The same schema runs in the browser for instant feedback and again in the
 * server action, because client validation is a courtesy and never a control —
 * anything can POST to a server action.
 */
export const contactInputSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "Please enter your first name.")
    .max(80, "That name is too long."),
  lastName: z
    .string()
    .trim()
    .min(1, "Please enter your last name.")
    .max(80, "That name is too long."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address.")
    .max(200, "That address is too long."),
  message: z
    .string()
    .trim()
    .min(10, "Please tell us a little more — at least a sentence.")
    .max(4000, "Please keep it under 4000 characters."),
  consent: z.literal(true, {
    message: "Please agree to the privacy policy.",
  }),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

/**
 * The honeypot field's name.
 *
 * A field no human sees and no human fills. It is the cheapest spam control
 * that costs a real visitor nothing — no puzzle, no third-party script, no
 * tracking — and it stops the naive bots that submit every input they find.
 * It is deliberately not part of `contactInputSchema`: a filled honeypot is not
 * a validation error to show someone, it is a submission to quietly drop.
 *
 * Named to look worth filling in. `honeypot` would be a hint.
 */
export const HONEYPOT_FIELD = "website";

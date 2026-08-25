/**
 * The contact domain — one form, one message, no storage.
 *
 * Server-only barrel: it re-exports the action, which reaches the email
 * transport and therefore `shared/config/env`. A client component imports
 * `model/contactInput` directly (structure.md §3b).
 */
export { sendContactAction, type ContactResult } from "./api/contactActions";
export { ContactForm } from "./ui/ContactForm";

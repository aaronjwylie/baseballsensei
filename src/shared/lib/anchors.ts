/**
 * In-page anchor ids shared across slices.
 *
 * `FEEDBACK_ANCHOR` names a panel that `domains/feedback` renders and that
 * `domains/submission`'s status card links to. Neither may import the other —
 * feedback already depends on submission, so the reverse would close a cycle —
 * and the alternative is the same string written twice, where a rename silently
 * turns the link into a no-op that scrolls nowhere.
 *
 * `shared/` is the domain-less floor, which is exactly where a fact both sides
 * need but neither owns belongs (CLAUDE.md §11: no magic strings).
 */
export const FEEDBACK_ANCHOR = "your-feedback";

import { site } from "@/shared/config/site";

/**
 * On the Admins tab only, and deliberately louder than the blurb.
 *
 * An admin's own address does two jobs and not a third: it signs them in, and
 * it is where they are told a submission arrived. It is **not** an address to
 * correspond from — replying to a customer from it hands them a personal
 * address, and their reply then comes back to that one person while `contact@`
 * never sees the rest of the thread (Ben + Aaron, 2026-09-09, choosing this
 * over the Workspace send-as work).
 *
 * It renders here because this is the page where an admin is *added*, which is
 * the moment the expectation is set. The same sentence is in the contact
 * notification itself, where the decision is actually taken.
 *
 * **Its own file so its rule can be tested.** Inline in an async page it could
 * only be checked by reading the source — and "shows on exactly one tab" is
 * precisely the kind of condition that regresses quietly (QA 1.2.20).
 */
export function AdminEmailNote({ kind }: { kind: string }) {
  if (kind !== "admins") return null;

  return (
    <p className="mt-3 max-w-[60ch] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
      <strong>
        Their address signs them in and tells them things — it is not for
        replying to customers.
      </strong>{" "}
      {`All correspondence runs between ${site.email} and the customer. An
      answer sent from a personal address arrives from that address, so the
      customer's reply goes back to that person alone and the shared inbox
      loses the rest of the conversation.`}
    </p>
  );
}

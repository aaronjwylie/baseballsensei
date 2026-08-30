import { PortalBar } from "../_portal/PortalBar";
import { getSession } from "@/domains/account";
import { getOperatorProfile } from "@/domains/operator";

/**
 * The account page's shell.
 *
 * Reached from the bar's own "Account" link — so without a bar of its own you
 * could navigate *into* it and then be stranded, with neither a way back nor a
 * way out (QA 4.6 follow-up).
 *
 * `home` is the portal chooser rather than a specific portal: whoever is here
 * may hold any combination of roles, and `/portal` sends a single-role operator
 * straight through anyway.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const email = session
    ? (await getOperatorProfile(session.operatorId))?.email
    : undefined;
  return (
    <>
      <PortalBar home="/portal" email={email} />
      <div className="py-8">{children}</div>
    </>
  );
}

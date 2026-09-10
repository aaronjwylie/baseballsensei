import { PortalBar } from "../_portal/PortalBar";
import { getSession, portalsFor } from "@/domains/account";
import { getOperatorProfile } from "@/domains/operator";

/**
 * The coach portal shell — the same top bar as admin, minus the section links
 * (a coach has one page: their reviews). Auth stays on the page; the session is
 * only read here to know whether to offer a way back to the other portal (QA
 * 4.7), and `getSession` is memoized per render so the page's own check is free.
 */
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const canSwitch = session ? portalsFor(session.roles).length > 1 : false;
  const email = session
    ? (await getOperatorProfile(session.operatorId))?.email
    : undefined;
  return (
    <>
      <PortalBar home="/coach" canSwitch={canSwitch} email={email} />
      {/* No vertical padding here: `PageColumn` owns the rhythm, and the
          empty state centres itself in the space this leaves. Two sources of
          it is what made the portals and the customer pages disagree. */}
      <div className="flex grow flex-col">{children}</div>
    </>
  );
}

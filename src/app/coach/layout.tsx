import { PortalBar } from "../_portal/PortalBar";
import { getSession, portalsFor } from "@/domains/account";

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
  return (
    <>
      <PortalBar home="/coach" canSwitch={canSwitch} />
      <div className="flex grow flex-col py-8">{children}</div>
    </>
  );
}

import { PortalBar } from "../_portal/PortalBar";

/**
 * The coach portal shell — the same top bar as admin, minus the section links
 * (a coach has one page: their reviews). Auth stays on the page.
 */
export default function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PortalBar home="/coach" />
      <div className="flex grow flex-col py-8">{children}</div>
    </>
  );
}

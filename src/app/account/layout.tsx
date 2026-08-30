import { PortalBar } from "../_portal/PortalBar";

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
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PortalBar home="/portal" />
      <div className="py-8">{children}</div>
    </>
  );
}

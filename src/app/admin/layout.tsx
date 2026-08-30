import { PortalBar } from "../_portal/PortalBar";
import { getSession, portalsFor } from "@/domains/account";
import { getOperatorProfile } from "@/domains/operator";

const ADMIN_LINKS = [
  { href: "/admin", label: "Submissions" },
  { href: "/admin/operators", label: "Operators" },
  { href: "/admin/settings", label: "Settings" },
];

/**
 * The admin portal shell: the top bar once, then the page. Auth stays on each
 * page (`requireRole` close to the data); the session read here only decides
 * whether an admin who also coaches or translates is offered a way back to the
 * chooser (QA 4.7). `getSession` is memoized, so the page's own check is free.
 */
export default async function AdminLayout({
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
      <PortalBar home="/admin" links={ADMIN_LINKS} canSwitch={canSwitch} email={email} />
      <div className="py-8">{children}</div>
    </>
  );
}

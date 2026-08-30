import { PortalBar } from "../_portal/PortalBar";

/**
 * The translator portal shell — the same top bar as coach, minus the section
 * links (a translator has one page: their assignments). Auth stays on the page.
 *
 * This layout did not exist. `/translator` rendered its page with no shell, so
 * the portal had no Sign out and no Account link — the only one of the three
 * operator portals a person could not leave (QA 4.6). Admin and coach had it
 * because they were built first; the translator portal arrived later and the
 * bar was not part of the page it copied.
 */
export default function TranslatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PortalBar home="/translator" />
      <div className="flex grow flex-col py-8">{children}</div>
    </>
  );
}

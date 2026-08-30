import { PortalBar } from "../_portal/PortalBar";

/**
 * The portal chooser's shell.
 *
 * It had none, so the page that exists to help someone *get somewhere* offered
 * no way to leave — no Sign out, no Account (QA 4.6 follow-up). Worst for the
 * case it handles most carefully: an operator with no roles granted reads
 * "nobody has assigned you a role yet" and, without this bar, has nowhere to go
 * and no way out. A dead end for the one person who cannot fix it themselves.
 *
 * `home` points back here rather than at a portal, because which portal is
 * exactly the question this page is asking.
 */
export default function PortalChooserLayout({
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

import type { Metadata } from "next";
import { Container } from "@/shared/ui";
import { requireRole } from "@/domains/account";
import { getSettings, SettingsForm } from "@/domains/settings";

export const metadata: Metadata = {
  title: "Admin — Settings",
  robots: { index: false },
};

export default async function AdminSettingsPage() {
  await requireRole("admin");
  const settings = await getSettings();

  return (
    <Container>
      <h1 className="font-display text-2xl font-medium uppercase tracking-[-0.01em] text-ink">Settings</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        Pricing, upload limits, and retention — these take effect immediately, no
        deploy needed.
      </p>

      <div className="mt-6 max-w-xl rounded-2xl border border-line bg-white p-6">
        <SettingsForm settings={settings} />
      </div>
    </Container>
  );
}

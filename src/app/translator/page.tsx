import { requireRole } from "@/domains/account";
import { Container } from "@/shared/ui";

export const metadata = { title: "Translator" };

/**
 * The translator's portal.
 *
 * Deliberately empty of a queue — and that is a true statement about *today's*
 * workflow, not an unbuilt one. Translation is handed off **off-platform**: the
 * admin assigns a translator, sends them the files directly, and files the
 * returned translation back on the admin side (`uploadTranslationAction`). So a
 * translator can sign in, but there is nothing for them to *do here yet*. The
 * in-app queue — download and upload your own translations here — is the
 * future on-platform phase (ADR 018), not something the current flow needs.
 *
 * The old copy said submissions "can't be sent to a translator yet", which
 * stopped being true once the off-platform hand-off shipped: they can be, just
 * not through this page.
 */
export default async function TranslatorPage() {
  await requireRole("translator");

  return (
    <Container className="py-12">
      <h1 className="text-2xl font-semibold text-ink">Translator</h1>
      <p className="mt-4 max-w-prose text-ink-muted">
        You&rsquo;re signed in. For now, translation work is handed off outside
        the app &mdash; the admin will send you the files to translate and you
        return the finished translation to them directly.
      </p>
      <p className="mt-3 max-w-prose text-ink-muted">
        Downloading and uploading your translations here, from your own queue,
        is coming in a later update. Until then there&rsquo;s nothing you need to
        do on this page.
      </p>
    </Container>
  );
}

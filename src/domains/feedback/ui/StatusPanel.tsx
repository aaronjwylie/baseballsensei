"use client";

import { StatusLookup } from "@/domains/submission/ui/StatusLookup";
import { FeedbackFiles } from "./FeedbackFiles";

/**
 * The whole `/status` page's interior: look yourself up, and download what is
 * ready — behind the one code that proves the inbox.
 *
 * It exists to compose two slices that may not import each other.
 * `domains/feedback` already depends on `domains/submission`, so the lookup
 * cannot reach back for the download panel; this sits on the feedback side,
 * where the dependency runs the right way, and hands the lookup a way to render
 * what it received.
 *
 * Client, so the render function crosses a client-to-client boundary. Passing
 * it from the server page would not serialise.
 */
export function StatusPanel() {
  return (
    <StatusLookup
      // A node per submission, keyed by id, so each card carries its own files.
      renderDownloads={(groups) =>
        Object.fromEntries(
          groups.map((g) => [
            g.submission.id,
            <FeedbackFiles key={g.submission.id} group={g} />,
          ]),
        )
      }
    />
  );
}

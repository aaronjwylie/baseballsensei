"use client";

import { StatusLookup } from "@/domains/submission/ui/StatusLookup";
import { FeedbackDownloads } from "./FeedbackDownloads";

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
      renderDownloads={(groups) => <FeedbackDownloads groups={groups} />}
    />
  );
}

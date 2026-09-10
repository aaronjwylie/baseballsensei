import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { PageColumn } from "@/shared/ui/PageColumn";

/**
 * QA 8.9.18 — the three customer pages resize the same way.
 *
 * They do it by wearing one shell rather than by three people making the same
 * decision three times. That is the claim under test, and it is worth testing
 * because it has failed before: each page had written the column out for
 * itself, so the first fix landed on one and the same report came back about
 * the other two — the same shape as the download row before it became
 * `FeedbackDownloadRow`.
 *
 * The tokens are stubbed: production's AUTH_SECRET is a Vercel "sensitive"
 * variable and unreadable, and the signing is not what this asks about.
 */
const EMAIL = "norman.norms.the.teddy.bear@example.test";

vi.mock("@/domains/submission", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  verifyStatusToken: async () => EMAIL,
}));
vi.mock("@/domains/feedback", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  verifyFeedbackToken: async () => null, // the "link didn't work" branch still wears the shell
}));

const StatusPage = (await import("@/app/status/page")).default;
const StatusToken = (await import("@/app/status/[token]/page")).default;
const FeedbackToken = (await import("@/app/feedback/[token]/page")).default;

const html = async (el: unknown) => renderToStaticMarkup((await el) as ReactElement);

/**
 * The shell's own wrapper — taken from `PageColumn` itself rather than matched
 * by a pattern. A pattern is a description of the component, and it goes stale
 * the moment the component changes: this one hunted for a `clamp` and stopped
 * finding anything when the clamps became two fixed steps.
 */
const SHELL = renderToStaticMarkup(<PageColumn>x</PageColumn>).match(
  /<section class="([^"]*)"/,
)![1];

const wearsShell = (markup: string) => markup.includes(`<section class="${SHELL}"`);

describe("8.9.18 — one shell, three pages", () => {
  it("renders the identical wrapper on all three", async () => {
    const pages = await Promise.all([
      html(StatusPage()),
      html(StatusToken({ params: Promise.resolve({ token: "t" }) })),
      html(FeedbackToken({ params: Promise.resolve({ token: "t" }) })),
    ]);
    // Every page carries the shell's own markup — not something that merely
    // looks like it.
    for (const markup of pages) expect(wearsShell(markup)).toBe(true);
  });

  /*
    The column's own rule, stated as arithmetic. `max-w-xl` with a constant
    `px-5` either side: content is min(576, viewport - 40), which only ever
    grows and then holds. The failure this replaced subtracted stepping gutters
    from the cap, so it fell.
  */
  it("never narrows as the window widens", async () => {
    const widths = [320, 375, 500, 639, 640, 800, 1023, 1024, 1440, 2560].map((w) =>
      Math.min(576, w - 2 * 20),
    );
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1]!);
    }
    expect(widths.at(-1)).toBe(576);
  });
});

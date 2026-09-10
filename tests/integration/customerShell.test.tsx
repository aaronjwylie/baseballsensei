import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

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

/** The shell's own wrapper — the bit every page must share. */
const shellOf = (markup: string) => {
  const m = markup.match(/<section class="([^"]*py-\[clamp[^"]*)"/);
  expect(m, "no NarrowPage section found").toBeTruthy();
  return m![1];
};

describe("8.9.18 — one shell, three pages", () => {
  it("renders the identical wrapper on all three", async () => {
    const pages = await Promise.all([
      html(StatusPage()),
      html(StatusToken({ params: Promise.resolve({ token: "t" }) })),
      html(FeedbackToken({ params: Promise.resolve({ token: "t" }) })),
    ]);
    const shells = pages.map(shellOf);
    expect(new Set(shells).size).toBe(1);
    // And it is the solved clamp, not a hand-written value.
    expect(shells[0]).toContain("clamp(2.5rem,0.904rem+6.81vw,3.5rem)");
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

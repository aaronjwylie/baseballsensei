import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

/**
 * QA 8.9.8 — the signed status link asks for nothing.
 *
 * Two doors onto the same list. `/status` lets anyone type an address, so it
 * sends a six-digit code and waits. `/status/[token]` arrives from an email we
 * sent to an address that verified itself at step 2 and paid at step 4 — the
 * link *is* the proof, and asking again proves nothing new while costing a trip
 * to the inbox for a code that is single-use.
 *
 * The page is an async server component, so it is awaited and then rendered.
 * `verifyStatusToken` is stubbed because production's AUTH_SECRET is a Vercel
 * "sensitive" variable and unreadable by anyone — including us. What is under
 * test is what the page does with a *valid* token, not the signing.
 */
vi.mock("@/domains/submission", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  verifyStatusToken: async () => "norman.norms.the.teddy.bear@example.test",
}));

const Page = (await import("@/app/status/[token]/page")).default;

const render = async (token: string) =>
  renderToStaticMarkup(
    (await Page({ params: Promise.resolve({ token }) })) as ReactElement,
  );

describe("/status/[token]", () => {
  it("8.9.8 shows no code prompt at all", async () => {
    const html = await render("a-valid-looking-token");
    expect(html).not.toContain("Email me a code");
    expect(html).not.toContain("6-digit");
    // The endpoint the form posts to never appears either.
    expect(html).not.toContain("feedback/code");
  });

  it("shows the list it was opened for", async () => {
    const html = await render("a-valid-looking-token");
    expect(html).toMatch(/Your submissions|nothing/i);
  });
});

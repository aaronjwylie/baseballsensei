import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Disclosure } from "@/app/admin/Disclosure";

/**
 * QA 8.9.32 / 8.9.33 — the three panels on a queue row read alike.
 *
 * "This submission", "Trail" and "Override" all render through this one
 * component, so they carry the same small-caps label and the same `›`. Override
 * had its own "Override…" link that swapped itself for a heading, which is the
 * kind of difference nobody designs and everybody notices.
 *
 * And it is a native `<details>`: it opens without hydration, so it cannot
 * desync from what is on screen the way a `useState` toggle can.
 */
const render = (label: string, hint?: string) =>
  renderToStaticMarkup(
    <Disclosure label={label} hint={hint}>
      <p>body</p>
    </Disclosure>,
  );

describe("Disclosure", () => {
  it("8.9.33 is a native details/summary, needing no hydration", () => {
    const html = render("Override");
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("body");
  });

  it("8.9.32 gives every panel the same handle and label treatment", () => {
    const a = render("This submission");
    const b = render("Trail");
    const c = render("Override");
    for (const html of [a, b, c]) {
      expect(html).toContain("›");
      expect(html).toContain("group-open:rotate-90");
      expect(html).toContain("uppercase");
    }
    // Identical but for the words: the treatment is the component's, not each
    // caller's.
    expect(a.replace("This submission", "X")).toBe(c.replace("Override", "X"));
  });

  it("shows a hint while closed and hides it once open", () => {
    const html = render("Trail", "4 events");
    expect(html).toContain("4 events");
    expect(html).toContain("group-open:hidden");
  });
});

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminEmailNote } from "@/app/admin/operators/AdminEmailNote";
import { site } from "@/shared/config/site";

/**
 * QA 1.2.20 — the note that sets the expectation when an admin is added.
 *
 * "Shows on exactly one tab" is the kind of condition that regresses quietly:
 * nothing breaks when it starts appearing everywhere, or nowhere. So the rule
 * is asserted rather than read.
 */
const render = (kind: string) =>
  renderToStaticMarkup(<AdminEmailNote kind={kind} />);

describe("AdminEmailNote", () => {
  it("says the address is not for replying to customers", () => {
    const html = render("admins");
    expect(html).toContain("not for replying to customers");
    expect(html).toContain(site.email);
    // The consequence, not just the instruction — it is the reverse of the one
    // people expect, so the note has to spell it out.
    expect(html).toContain("goes back to that person alone");
  });

  it("appears on the Admins tab and nowhere else", () => {
    expect(render("admins")).not.toBe("");
    for (const other of ["all", "coaches", "translators", "none"]) {
      expect(render(other)).toBe("");
    }
  });
});

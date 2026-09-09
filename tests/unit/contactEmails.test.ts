import { describe, expect, it } from "vitest";
import { quotedMessage } from "@/shared/email/shell";

/**
 * QA 1.2.9 / 1.2.10 — the contact form's two emails.
 *
 * The admin's copy and the writer's receipt quote the same words through one
 * `quotedMessage`, so they cannot come to disagree about how somebody's message
 * is shown — and nobody would notice if they did, because no one sees both
 * except by accident.
 *
 * The escaping is the part worth a test. The name and the message are exactly
 * the two fields a bot fills with markup, and this block is where both land.
 */
describe("quotedMessage", () => {
  it("1.2.10 shows tags as text, not markup", () => {
    const html = quotedMessage('<script>alert("x")</script> & "quoted"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("keeps the writer's line breaks", () => {
    const html = quotedMessage("one\ntwo");
    expect(html).toContain("one<br />two");
  });

  /*
    Escape first, then break lines. The other order turns the `<br />` this
    inserts into `&lt;br /&gt;` — visible markup in someone's own words.
  */
  it("breaks lines after escaping, not before", () => {
    expect(quotedMessage("a\nb")).not.toContain("&lt;br");
  });

  it("8.9.12's rule again — the shell's palette, not literals", () => {
    const html = quotedMessage("hi");
    expect(html).toContain("#f2f2f2");
    expect(html).toContain("#313fd2");
  });
});

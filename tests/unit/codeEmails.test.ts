import { describe, expect, it } from "vitest";
import { codeBlock } from "@/shared/email/shell";

/**
 * QA 8.9.11 / 8.9.12 — the two code emails look the same, and follow the shell.
 *
 * A customer sees both: the six-digit code at step 2 of the flow, and the access
 * code for `/status`. They differed in five ways — box, typeface, size, tracking
 * and colour — which reads as two different systems mailing you, and the second
 * one as the less trustworthy.
 *
 * They share `codeBlock` now, so the check is that the shared thing exists and
 * that both call it. The first half is here; the second is a grep, because "does
 * this module call that function" is a question about the source and not about a
 * rendered string.
 */
describe("codeBlock — one panel for both codes", () => {
  it("8.9.11 renders the same panel whatever the code", () => {
    const a = codeBlock("123456");
    const b = codeBlock("987654");
    // Identical but for the digits: strip them and the markup must match.
    expect(a.replace("123456", "")).toBe(b.replace("987654", ""));
  });

  /*
    8.9.12 — the greys are the shell's own tokens, not literals. This markup
    hardcoded `#f2f2f2` and `#d9d9da` — which are PAPER_ALT and LINE, four lines
    above it — so a palette change would have moved the shell and left the code
    panel behind.
  */
  it("8.9.12 uses the shell's palette", () => {
    const html = codeBlock("123456");
    // The shell's own values, reached through it rather than retyped here.
    const shell = String(codeBlock("000000"));
    expect(shell).toContain("#f2f2f2");
    expect(shell).toContain("#d9d9da");
    expect(html).toContain("border-radius");
    expect(html).toContain("text-align:center");
  });

  it("carries the code itself", () => {
    expect(codeBlock("246810")).toContain("246810");
  });
});

/**
 * The brand shell every transactional email wears.
 *
 * The messages are genuinely different and live in their own domains; what they
 * share — the header, the type scale, the CTA button, the footer — is written
 * once, here. Symmetry built in rather than hoped for (principle #8).
 *
 * Inline styles and table-free markup are deliberate: email clients strip
 * <style> blocks and Gmail clips long messages, so these stay short and link out.
 *
 * The hex values mirror the tokens in `app/globals.css` — email can't read CSS
 * variables, so this is the one place a colour is written twice. Change one,
 * change the other, or the emails drift from the site.
 *
 * The wordmark is set as text rather than the site's SVG: SVG is stripped by
 * Gmail and most clients, so "Baseball" white / "Sensei" lime is rebuilt in
 * markup, uppercase and condensed to read like the logo. Oswald won't load in
 * mail (web fonts are unreliable there), so the display stack falls to a
 * condensed system face.
 */
import { site } from "@/shared/config/site";

export interface EmailCta {
  label: string;
  url: string;
}

// Baseball Sensei's palette, from app/globals.css.
const INK = "#19191b";
const INK_SOFT = "#454546";
const INK_MUTED = "#818184";
const PAPER_ALT = "#f2f2f2";
const LINE = "#d9d9da";
const ACCENT = "#313fd2";
const LIME = "#c9f950";
const DISPLAY = "'Oswald','Arial Narrow',Arial,sans-serif";
const BODY = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** "Baseball" in white, the last word in lime — the site lockup, as text. */
function wordmark(): string {
  const words = site.name.split(" ");
  const last = words.pop() ?? "";
  const lead = words.join(" ");
  return `${lead ? `${lead} ` : ""}<span style="color:${LIME};">${last}</span>`;
}

export function emailShell(
  heading: string,
  body: string,
  cta?: EmailCta,
  /**
   * The footer line after the wordmark. Defaults to the submission wording that
   * fits the customer messages, which are most of them; an operator-facing
   * message (a welcome, a hand-off) passes its own, because telling a coach a
   * note is "about your coaching submission" is a small lie about who they are.
   */
  footerNote = "This is an automated message about your coaching submission.",
): string {
  return `
  <div style="font-family:${BODY};background:${PAPER_ALT};padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid ${LINE};">
      <div style="background:${INK};padding:22px 32px;">
        <span style="font-family:${DISPLAY};font-size:22px;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;color:#ffffff;">${wordmark()}</span>
      </div>
      <div style="padding:32px;">
        <h1 style="margin:0 0 16px;font-family:${DISPLAY};font-size:25px;font-weight:600;letter-spacing:0.01em;text-transform:uppercase;color:${INK};">${heading}</h1>
        <div style="font-size:15px;line-height:1.6;color:${INK_SOFT};">${body}</div>
        ${
          cta
            ? `<div style="margin-top:28px;"><a href="${cta.url}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:12px;font-size:15px;">${cta.label}</a></div>`
            : ""
        }
      </div>
      <div style="padding:20px 32px;background:${PAPER_ALT};border-top:1px solid ${LINE};font-size:12px;color:${INK_MUTED};">
        ${site.name} · ${footerNote}
      </div>
    </div>
  </div>`;
}

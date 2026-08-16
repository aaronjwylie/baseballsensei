import type { SplitHeading } from "../model/copy";

/**
 * The page's one heading shape: a phrase in the ground's own text colour, with
 * its second half picked out in the brand's other colour.
 *
 * Five sections use it and the pairing flips with the ground — lime on the dark
 * and blue bands, blue on the light ones. That flip is not decoration: lime on
 * paper measures 1.22:1 and is unreadable, which is exactly why `tone` is a
 * required choice rather than a default.
 *
 * The design sets every one of these in uppercase while the copy stores them in
 * sentence case. `uppercase` here rather than shouting in the source keeps the
 * strings readable for whoever edits them, and keeps screen readers from
 * spelling out words letter by letter.
 */
export function SectionHeading({
  title,
  tone,
  align = "left",
  className = "",
  as: Tag = "h2",
}: {
  title: SplitHeading;
  tone: "onDark" | "onLight";
  align?: "left" | "center";
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <Tag
      className={`font-display text-[32px] font-medium uppercase leading-[1.02] tracking-[-0.02em] lg:text-[42px] ${
        tone === "onDark" ? "text-paper" : "text-ink"
      } ${align === "center" ? "text-center" : ""} ${className}`}
    >
      {title.lead}{" "}
      <span className={tone === "onDark" ? "text-highlight" : "text-accent"}>
        {title.highlight}
      </span>
    </Tag>
  );
}

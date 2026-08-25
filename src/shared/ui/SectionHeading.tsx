/**
 * A heading the design sets in two colours — a phrase in the ground's own text
 * colour, with its second half picked out in the brand's other colour.
 *
 * Splitting the string rather than the markup keeps the break a **copy**
 * decision, which is what it is: move a word across and the emphasis moves with
 * it, without anyone opening a component.
 *
 * The pairing flips with the ground — lime on the dark and blue bands, blue on
 * the light ones. That flip is not decoration: lime on paper measures 1.22:1
 * and is unreadable, which is why `tone` is a required choice with no default.
 *
 * The design sets every one of these in uppercase while the copy stores them in
 * sentence case. Shouting in CSS rather than in the source keeps the strings
 * readable for whoever edits them, and keeps screen readers from spelling out
 * words letter by letter.
 *
 * Lives in `shared/ui` because the landing page, the contact page and the
 * checkout flow all set their headings this way.
 */
export type SplitHeading = { lead: string; highlight: string };

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

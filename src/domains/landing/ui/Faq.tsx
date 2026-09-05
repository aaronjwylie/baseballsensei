import { Container, SectionHeading } from "@/shared/ui";
import { faqHeading, faqs } from "../model/copy";

/**
 * The objections, on the second blue band.
 *
 * **`<details>`/`<summary>`, not React state.** The browser already implements
 * this control — keyboard operation, the expanded/collapsed announcement, and
 * find-in-page reaching text inside a closed panel all come free, and the
 * section stays a server component with no JavaScript shipped for it. A
 * hand-rolled accordion would have had to re-earn each of those.
 *
 * The first panel is open because the design draws it open: it is the strongest
 * answer, and an accordion where nothing is expanded reads as a list of
 * problems rather than a list of resolutions.
 *
 * The `+`/`−` is drawn as two centred bars, not a text glyph: a text "+" rides
 * high in the circle because its ink sits on the font's math axis, above the
 * line-box centre, and no amount of flex-centring fixes that. Two absolutely
 * centred bars sit dead-centre regardless of the font; dropping the vertical one
 * when open leaves the minus. It stays hidden from assistive tech — `<summary>`
 * already announces expanded state, so reading the sign too would say it twice.
 */
export function Faq() {
  return (
    <section id="faq" className="scroll-mt-8 bg-accent py-20 lg:py-28">
      <Container>
        <SectionHeading tone="onDark" align="center" title={faqHeading} />

        <div className="mx-auto mt-14 flex max-w-[720px] flex-col gap-3">
          {faqs.map((faq, index) => (
            <details
              key={faq.q}
              open={index === 0}
              className="group rounded-xl bg-ink px-5 py-4"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] text-paper [&::-webkit-details-marker]:hidden lg:text-[18px]">
                {faq.q}
                <span
                  aria-hidden
                  className="relative flex h-6 w-6 shrink-0 rounded-full bg-highlight"
                >
                  <span className="absolute left-1/2 top-1/2 h-[2px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
                  <span className="absolute left-1/2 top-1/2 h-[11px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink group-open:hidden" />
                </span>
              </summary>

              <p className="mt-3 max-w-[600px] text-[14px] leading-[1.5] text-band">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

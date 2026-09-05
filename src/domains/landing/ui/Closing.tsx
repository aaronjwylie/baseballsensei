import Image from "next/image";
import { Container, SectionHeading } from "@/shared/ui";
import { closing } from "../model/copy";

/**
 * The emotional close before the ask — the promise stated plainly, over a strip
 * of players.
 *
 * The photographs are decorative: every one of them shows what the sentence
 * above already says, so they carry empty `alt` rather than a description that
 * would make a screen reader listen to the same idea five times.
 *
 * The strip is a grid rather than the design's single row, because four tiles
 * at a row's worth of width become unreadably narrow on a phone. Two up at the
 * small size, four across from `sm`.
 */
export function Closing() {
  return (
    <section className="bg-paper-alt pt-20 lg:pt-28">
      <Container>
        <SectionHeading
          tone="onLight"
          align="center"
          stack
          title={closing.title}
        />

        <p className="mx-auto mt-5 max-w-[560px] text-center text-[15px] leading-[1.5] text-ink-soft">
          {closing.body}
        </p>
      </Container>

      <ul className="mt-14 grid grid-cols-2 gap-4 px-4 pb-2 sm:grid-cols-4 lg:gap-6 lg:px-6">
        {closing.gallery.map((src) => (
          <li
            key={src}
            className="relative aspect-[3/4] overflow-hidden rounded-[28px]"
          >
            <Image
              src={src}
              alt=""
              fill
              sizes="(min-width: 640px) 25vw, 50vw"
              className="object-cover"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

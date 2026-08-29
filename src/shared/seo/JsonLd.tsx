/**
 * Renders a JSON-LD structured-data block.
 *
 * Server-only in practice: the schema builders read `env`/`site` config. Google
 * parses these blocks to build rich results — the FAQ accordion in search, the
 * brand's knowledge panel — so they belong in the initial HTML, not injected
 * later by script.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // The payload is our own, built from config — never user input. The one
      // real risk is a literal "<" inside a string closing the <script> early,
      // so it's escaped.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

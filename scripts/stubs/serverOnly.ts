/**
 * A no-op stand-in for the `server-only` package, used only by `npm run simulate`.
 *
 * `import "server-only"` is a build-time assertion: Next resolves it to an empty
 * module in a server bundle and to one that throws in a client bundle, so a
 * module that must never reach the browser can say so and have the build prove
 * it. Seven files use it.
 *
 * Under `tsx` there is no bundler and no `react-server` export condition, so the
 * import resolved to nothing and `simulate` died on the first file that used it
 * — which is why the ladder simulation had been failing to *start* rather than
 * failing a check, and had been dark long enough that nobody could tell the
 * difference (Ben, 2026-08-31).
 *
 * Installing the real package would not help: outside a server bundle its
 * default entry throws by design. The assertion is meaningful to the build and
 * meaningless to a script that is server-side by definition, so the script maps
 * it to nothing. `tsconfig.json` is untouched, so the guarantee the real module
 * provides to `next build` is exactly as it was.
 */
export {};

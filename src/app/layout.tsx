import type { Metadata } from "next";
import { Geist_Mono, Lexend, Oswald } from "next/font/google";
import "./globals.css";
import { env } from "@/shared/config/env";
import { site } from "@/shared/config/site";
import { SiteHeader } from "@/shared/layout/SiteHeader";
import { SiteFooter } from "@/shared/layout/SiteFooter";
import { SiteChrome } from "@/shared/layout/SiteChrome";
import { QaProbe } from "@/domains/qa";

/**
 * Two faces, from Audrey's `Colours+typography` board (Figma
 * `Bassball Coaching Design`, read 2026-08-15). This replaces Jost, which was
 * only ever a guess at the wireframe's face — the open TODO here asked for
 * exactly this confirmation.
 *
 * **Oswald carries every heading and every button label.** It is condensed, so
 * it holds a 52px H1 in the width the design gives it; the design uses 500 for
 * display sizes and 600 at 14px for buttons and eyebrows.
 *
 * **Lexend carries body copy**, 400 through 700. Both are variable fonts, so
 * no weight array is needed and the whole range costs one file each.
 */
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.subhead,
  openGraph: {
    title: `${site.name} — ${site.tagline}`,
    description: site.subhead,
    siteName: site.name,
    type: "website",
  },
};

/**
 * `QaProbe` is rendered unconditionally and **gates itself in the browser**.
 *
 * The obvious version read the arming cookie here and mounted the probe only
 * when it was set. That reads better and is wrong: `cookies()` in the root
 * layout opts *every route in the app* out of static rendering. It turned `/`
 * from an ISR page into a dynamic one, and `/contact`, `/terms`, `/login` and
 * `/status` from static into dynamic, to decide whether to render a component
 * that is almost always nothing.
 *
 * So the probe ships to everyone and does nothing unless it finds the arming
 * cookie — which only a route holding `QA_TOKEN` can set, and which is useless
 * anyway because the ingest endpoint 404s without the same token. The cost is a
 * few inert kilobytes in the client bundle; the alternative was every page on
 * the site rendered from scratch on every request.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${oswald.variable} ${lexend.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <SiteChrome
          header={<SiteHeader />}
          overlayHeader={<SiteHeader transparent />}
          footer={<SiteFooter />}
        >
          <main className="flex-1">{children}</main>
        </SiteChrome>
        <QaProbe />
      </body>
    </html>
  );
}

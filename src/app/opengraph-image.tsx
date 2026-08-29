import { ImageResponse } from "next/og";
import { site } from "@/shared/config/site";

/**
 * The share card (Open Graph / Twitter) for the site. Generated rather than a
 * static file so it stays in step with the brand facts in `site`, and drawn in
 * the marketing palette — ink ground, the two-tone wordmark, lime accent.
 */
export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#19191b",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 88,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            color: "#ffffff",
          }}
        >
          Baseball&nbsp;<span style={{ color: "#c9f950" }}>Sensei</span>
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 44,
            fontWeight: 600,
            color: "#ffffff",
          }}
        >
          {site.tagline}
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 26,
            maxWidth: 900,
            lineHeight: 1.4,
            color: "#a7a7a9",
          }}
        >
          Pitching and batting analysis from a professional baseball coach in
          Japan — a real coach, not an algorithm.
        </div>
        <div
          style={{
            marginTop: 44,
            display: "flex",
            alignItems: "center",
            fontSize: 24,
            fontWeight: 700,
            color: "#19191b",
            backgroundColor: "#c9f950",
            padding: "12px 26px",
            alignSelf: "flex-start",
          }}
        >
          GET COACH FEEDBACK
        </div>
      </div>
    ),
    { ...size },
  );
}

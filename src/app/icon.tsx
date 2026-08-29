import { ImageResponse } from "next/og";

/**
 * The favicon — shown in the browser tab and, now, beside the title in Google
 * results. A lime tile with an ink "S" (for Sensei, the lime half of the
 * wordmark): high-contrast at 32px and unmistakably the brand's colour.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#c9f950",
          color: "#19191b",
          fontSize: 24,
          fontWeight: 800,
          fontFamily: "sans-serif",
          borderRadius: 6,
        }}
      >
        S
      </div>
    ),
    { ...size },
  );
}

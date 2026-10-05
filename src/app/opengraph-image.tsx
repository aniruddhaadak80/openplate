import { ImageResponse } from "next/og";
import { SITE } from "@/lib/config";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The social card, drawn rather than photographed.
 *
 * It uses the same ground, the same spot inks and the same step wedge as the
 * product, so the card in a timeline is recognisably the same object as the page
 * it links to. Rendered at build time, so it needs no image asset in the repo.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#14100e",
          padding: 72,
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 3, height: 56, background: "#473d33" }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 26, color: "#877c70", letterSpacing: 6, fontFamily: "monospace" }}>
              RIGHTS CLEARANCE DESK
            </div>
            <div style={{ fontSize: 68, color: "#f2ece1", marginTop: 10 }}>{SITE.name}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 40, color: "#b9afa1", lineHeight: 1.35 }}>
            A painting can be out of copyright and the photograph of it can still be protected.
          </div>

          {/* The step wedge, ten patches of one ink at rising density. */}
          <div style={{ display: "flex", gap: 6 }}>
            {["#241d19", "#2e2620", "#3a312a", "#483d34", "#574a3f", "#67584b", "#7a6858", "#8f7a66", "#a68e77", "#bfa68c"].map(
              (colour, index) => (
                <div
                  key={index}
                  style={{
                    width: 96,
                    height: 34,
                    background: index < 7 ? colour : index === 7 ? "#4b9fd8" : "#e8452f",
                  }}
                />
              ),
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, fontFamily: "monospace", color: "#877c70" }}>
            <span>met · cle · wikidata</span>
            <span style={{ color: "#f0a12e" }}>SHA-384 sealed</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

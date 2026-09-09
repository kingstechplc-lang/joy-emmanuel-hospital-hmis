"use client";

// =====================================================================
// QrCodeSvg — React wrapper around the `qrcode` library that produces
// a self-contained inline SVG. Works both:
//   - On-screen in the live app (synchronous — no useEffect)
//   - In the print popup (renderToStaticMarkup produces a real SVG
//     string that the popup window renders without hydration)
//
// WHY SYNCHRONOUS:
//   - The `qrcode` library exposes a low-level `QRCode.create(text, opts)`
//     API that is SYNCHRONOUS and returns a `QrCode` object with a
//     `modules` property we can iterate over.
//   - We use this to build the SVG path string during render, avoiding
//     any useEffect/useState. This is critical because `PrintButton`
//     serializes the React tree via `renderToStaticMarkup`, which
//     does NOT run effects — so any async-only QR generator would
//     produce a blank box in the print popup.
//   - The QR matrix is small (typically 25x25 to 33x33 modules), so
//     building the SVG string on every render is cheap (~1ms).
//
// WHY SVG (not canvas):
//   - renderToStaticMarkup cannot serialize a <canvas>'s drawn pixels
//     to the popup window. SVG survives the round-trip intact and
//     renders crisp at any printer DPI.
//   - Thermal printers (Zebra, Brother, etc.) rasterize SVG cleanly
//     through the browser's print pipeline.
// =====================================================================

import { useMemo } from "react";
import QRCode from "qrcode";

type QrCodeSvgProps = {
  /** The data to encode (URL, token, text — anything). */
  value: string;
  /** Pixel size of the rendered <svg> on screen / print. */
  size?: number;
  /** Foreground color (modules). Default: pure black. */
  fg?: string;
  /** Background color. Default: pure white (transparent won't scan reliably). */
  bg?: string;
  /** Error correction level — higher = more redundant, survives smudges. */
  level?: "L" | "M" | "Q" | "H";
  /** Margin (in modules) around the QR. Default 0 — wristband prints are tight. */
  margin?: number;
  /** Optional className for the <svg>. */
  className?: string;
};

export function QrCodeSvg({
  value,
  size = 120,
  fg = "#000000",
  bg = "#ffffff",
  level = "M",
  margin = 0,
  className,
}: QrCodeSvgProps) {
  // Build the SVG string synchronously from the QR matrix.
  // QRCode.create is the synchronous low-level API; we then iterate
  // over its modules to construct an SVG with one <rect> per dark module.
  const svgMarkup = useMemo(() => {
    if (!value) return "";
    try {
      const qr = QRCode.create(value, {
        errorCorrectionLevel: level,
        margin,
      });
      const moduleCount = qr.modules.size;
      // viewBox = total modules + margin on each side
      const totalSize = moduleCount + margin * 2;

      // Build SVG path using a single <path> with one M+h+v command per
      // dark module (more efficient than many <rect> elements).
      // Each dark module becomes a 1x1 square at (col+margin, row+margin).
      let pathData = "";
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.modules.get(row, col)) {
            const x = col + margin;
            const y = row + margin;
            // M = move to, h = horizontal lineto, v = vertical, z = close
            pathData += `M${x},${y}h1v1h-1z`;
          }
        }
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" preserveAspectRatio="xMidYMid meet"><rect width="${totalSize}" height="${totalSize}" fill="${bg}"/><path d="${pathData}" fill="${fg}"/></svg>`;
    } catch {
      return "";
    }
  }, [value, fg, bg, level, margin]);

  if (!svgMarkup) {
    // Empty value OR generation failed — render an empty placeholder
    // so the container keeps its size for layout stability.
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          background: bg,
          borderRadius: 2,
        }}
        aria-label="QR code unavailable"
      />
    );
  }

  return (
    <div
      className={className}
      style={{ width: size, height: size, display: "inline-block" }}
      aria-label={`QR code for ${value}`}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}

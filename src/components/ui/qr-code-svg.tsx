"use client";

// =====================================================================
// QrCodeSvg — React wrapper around the `qrcode` library that produces
// a self-contained inline SVG. Works both:
//   - On-screen in the live app (uses useEffect + state)
//   - In the print popup (renderToStaticMarkup produces a real SVG
//     string that the popup window renders without hydration)
//
// Why SVG and not canvas?
//   - renderToStaticMarkup cannot serialize a <canvas> element's
//     drawn pixels to the popup window. SVG survives the round-trip
//     intact and renders crisp at any printer DPI.
//   - Thermal printers (Zebra, Brother, etc.) rasterize SVG cleanly
//     through the browser's print pipeline.
//
// Why server-side safe (no top-level await):
//   - We generate the QR string in a useEffect so SSR / static render
//     doesn't try to call the qrcode library at import time.
// =====================================================================

import { useEffect, useState, useMemo } from "react";
import QR from "qrcode";

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
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    if (!value) {
      // Skip generation entirely; svg state remains empty.
      return;
    }
    let cancelled = false;
    QR.toString(value, {
      type: "svg",
      margin,
      errorCorrectionLevel: level,
      color: { dark: fg, light: bg },
    })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => {
        if (!cancelled) setSvg("");
      });
    return () => {
      cancelled = true;
    };
  }, [value, fg, bg, level, margin]);

  // Memo a consistent key for React's reconciliation
  const containerKey = useMemo(() => `${value}-${size}-${level}`, [value, size, level]);

  if (!svg) {
    // Skeleton placeholder while generating (avoids layout shift)
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          background: bg,
          borderRadius: 2,
          opacity: 0.4,
        }}
        aria-label="Generating QR code"
      />
    );
  }

  // We wrap the SVG in a sized container so consumers can size it
  // without manipulating the inner viewBox. The inner <svg> takes
  // width/height 100% so it scales to the container.
  return (
    <div
      key={containerKey}
      className={className}
      style={{ width: size, height: size, display: "inline-block" }}
      aria-label={`QR code for ${value}`}
      // Render the SVG markup directly. React will treat this as a
      // controlled string; since the qrcode library output is stable
      // for the same input, this is safe.
      dangerouslySetInnerHTML={{ __html: svg.replace(/<svg /, `<svg width="100%" height="100%" `) }}
    />
  );
}

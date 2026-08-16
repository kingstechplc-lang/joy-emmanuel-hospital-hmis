"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────
// LAZY-LOAD THE ACTUAL PROVIDERS ON THE CLIENT ONLY
// ─────────────────────────────────────────────────────────────────────
// WHY: next-auth/react's SessionProvider internally constructs a URL
// from process.env.NEXTAUTH_URL or window.location.origin. During
// Vercel's `next build` step, Next.js tries to prerender pages like
// /_not-found, which run the root layout, which renders <Providers/>.
// If SessionProvider runs at build time (SSR), `new URL("")` throws
// "TypeError: Invalid URL" because NEXTAUTH_URL isn't set during build.
//
// By lazy-loading the inner Providers component via `next/dynamic` with
// `ssr: false`, we ensure the SessionProvider never runs during SSR/prerendering.
// It only mounts in the browser, where `window.location.origin` is available.
//
// This is the recommended pattern for NextAuth v4 + Next.js App Router
// on serverless platforms (Vercel, etc.).
const ProvidersInner = dynamic(
  () => import("./providers-inner").then((m) => m.ProvidersInner),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-600">Loading Joy Emmanuel Hospital HMIS…</p>
        </div>
      </div>
    ),
  }
);

export function Providers({ children }: { children: ReactNode }) {
  return <ProvidersInner>{children}</ProvidersInner>;
}

"use client";
import { useState, useEffect, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/query-provider";

// ─────────────────────────────────────────────────────────────────────
// WHY THIS PATTERN
// ─────────────────────────────────────────────────────────────────────
// next-auth/react's SessionProvider internally calls `new URL()` on
// NEXTAUTH_URL or window.location.origin. During Vercel's `next build`
// prerendering step (for /_not-found), `window` is undefined and
// NEXTAUTH_URL may not be set, causing `TypeError: Invalid URL`.
//
// We solve this by gating the SessionProvider (and all client-only
// providers) behind a `mounted` state that becomes true only after
// the component hydrates on the client. During SSR/build, we render
// a simple loading spinner — no SessionProvider, no URL construction.
//
// Previously we used next/dynamic with ssr: false, but Turbopack
// has intermittent race conditions in dev mode where the browser
// requests the chunk before it's been written (ChunkLoadError).
// This pattern avoids that by keeping everything in a single file.
// ─────────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Shown during SSR and the very first client render before hydration.
    // This is what Vercel's build-time prerendering sees — no SessionProvider.
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-600">Loading Joy Emmanuel Hospital HMIS…</p>
        </div>
      </div>
    );
  }

  // Once mounted on the client, render the full provider tree.
  // window.location.origin is now available for NextAuth.
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <QueryProvider>
          {children}
          <Toaster richColors position="top-right" />
        </QueryProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

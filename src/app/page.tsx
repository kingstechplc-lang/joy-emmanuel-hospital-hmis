"use client";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { LoginView } from "@/components/views/login-view";
import { AppShell } from "@/components/layout/app-shell";
import { useAppStore } from "@/stores/app-store";

// Force dynamic — this page uses useSession which depends on cookies.
// Without this, Next.js tries to prerender at build time and fails
// because there's no session/cookies available during build.
export const dynamic = "force-dynamic";

export default function Home() {
  const { data: session, status } = useSession();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setActiveFacility = useAppStore((s) => s.setActiveFacility);
  const initialized = useRef(false);

  // Set the active facility from session ONLY ONCE on first login.
  // We must NOT re-trigger when the user deliberately clears the facility
  // (selecting "All Facilities" sets activeFacilityId to null intentionally).
  // The initialized ref ensures this only runs once per session.
  useEffect(() => {
    if (session && !initialized.current) {
      initialized.current = true;
      // Only auto-set if the user doesn't already have a facility selected
      // (e.g., from persisted zustand state)
      if (!activeFacilityId) {
        const facilityId = (session.user as any)?.facilityId;
        if (facilityId) setActiveFacility(facilityId);
      }
    }
  }, [session, activeFacilityId, setActiveFacility]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-600">Loading Joy Emmanuel Hospital HMIS…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginView />;
  }

  return <AppShell />;
}

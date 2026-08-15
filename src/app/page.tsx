"use client";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { LoginView } from "@/components/views/login-view";
import { AppShell } from "@/components/layout/app-shell";
import { useAppStore } from "@/stores/app-store";

export default function Home() {
  const { data: session, status } = useSession();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setActiveFacility = useAppStore((s) => s.setActiveFacility);

  // Set the active facility from session if not yet set
  useEffect(() => {
    if (session && !activeFacilityId) {
      const facilityId = (session.user as any)?.facilityId;
      if (facilityId) setActiveFacility(facilityId);
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

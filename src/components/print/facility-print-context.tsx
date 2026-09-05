"use client";

// =====================================================================
// facility-print-context.tsx
//
// React context + hook that exposes the active facility's branding info
// (name, address, phone, email, logoUrl) and the organization's logoUrl
// to print components.  This avoids each call site having to pass
// `facility={...}` explicitly and centralizes facility branding for all
// print documents.
//
// The hook pulls the active facility from `/api/facilities` (the existing
// endpoint already used elsewhere in the app) and selects the row
// matching `activeFacilityId` from the app store.  If the user is at
// organization level (no facility selected), the first facility is used
// as a fallback.  The organization's logoUrl comes from the session
// (NextAuth doesn't include it; we fetch it from /api/facilities and
// also expose a separate /api/organization/info if needed — but for now
// we read it from the first facility's organization relation if
// available, otherwise fall back to the ShieldPlus icon).
//
// Caching: react-query with a 5-minute staleTime.  The facility list
// changes rarely.
// =====================================================================

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { safeJson } from "@/components/ui-helpers";

// ─── Types ──────────────────────────────────────────────────────────

export interface FacilityBranding {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Logo URL inherited from the Organization (org.logoUrl). May be null. */
  logoUrl?: string | null;
}

interface FacilityApiResponse {
  facilities: any[];
  items: any[];
}

// ─── Context ────────────────────────────────────────────────────────

const FacilityPrintContext = React.createContext<FacilityBranding | null>(null);

// ─── Provider ───────────────────────────────────────────────────────

export function FacilityPrintProvider({ children }: { children: React.ReactNode }) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);

  const { data } = useQuery<FacilityBranding | null>({
    queryKey: ["facility-print-branding", activeFacilityId || "all"],
    queryFn: async () => {
      const res = await fetch("/api/facilities");
      if (!res.ok) return null;
      const json = (await safeJson(res).catch(() => ({}))) as FacilityApiResponse | null;
      const list = json?.facilities || json?.items || [];
      if (list.length === 0) return null;
      // Pick the active facility, or fall back to the first one.
      const f = (activeFacilityId && list.find((x) => x.id === activeFacilityId)) || list[0];
      // Organization logo may come from a nested relation; defensively read it.
      const orgLogo = (f as any)?.organization?.logoUrl || (f as any)?.logoUrl || null;
      const branding: FacilityBranding = {
        id: f.id,
        name: f.name || "Joy Emmanuel Hospital",
        address: f.address || null,
        city: f.city || null,
        region: f.region || null,
        country: f.country || null,
        phone: f.phone || null,
        email: f.email || null,
        logoUrl: orgLogo,
      };
      return branding;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  return (
    <FacilityPrintContext.Provider value={data ?? null}>
      {children}
    </FacilityPrintContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────

export function useFacilityBranding(): FacilityBranding | null {
  return React.useContext(FacilityPrintContext);
}

// =====================================================================
// PATIENT PORTAL — state store (mirrors src/stores/app-store.ts)
// =====================================================================
// Zustand + persist. Only persists `sidebarCollapsed` — the `view`
// is intentionally NOT persisted (always starts on "dashboard" when
// the patient logs in, mirroring the staff app's pattern).
// =====================================================================
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PortalViewKey =
  | "dashboard"
  | "lab_results"
  | "appointments"
  | "invoices";

type PortalState = {
  view: PortalViewKey;
  sidebarCollapsed: boolean;
  setView: (v: PortalViewKey) => void;
  toggleSidebar: () => void;
};

export const PORTAL_NAV_ITEMS: Array<{
  key: PortalViewKey;
  label: string;
  icon: string;
  category: string;
}> = [
  { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", category: "Overview" },
  { key: "appointments", label: "Appointments", icon: "Calendar", category: "My Health" },
  { key: "lab_results", label: "Lab Results", icon: "FlaskConical", category: "My Health" },
  { key: "invoices", label: "Invoices & Receipts", icon: "Receipt", category: "My Health" },
];

export const PORTAL_NAV_CATEGORIES = ["Overview", "My Health"];

export const usePortalStore = create<PortalState>()(
  persist(
    (set) => ({
      view: "dashboard",
      sidebarCollapsed: false,
      setView: (v) => set({ view: v }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "jem-portal-store",
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    }
  )
);

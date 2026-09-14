"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PortalShell } from "@/components/portal/portal-shell";
import { usePortalStore } from "@/stores/portal-store";
import { getPortalToken } from "@/lib/patient-portal/client";

export default function PortalAppointmentsPage() {
  const router = useRouter();
  const setView = usePortalStore((s) => s.setView);

  useEffect(() => {
    if (!getPortalToken()) { router.replace("/portal/login"); return; }
    setView("appointments");
  }, [router, setView]);

  if (!getPortalToken()) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-500 text-sm">Redirecting...</p></div>;
  return <PortalShell />;
}

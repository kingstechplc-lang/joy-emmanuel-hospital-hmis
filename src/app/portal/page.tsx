// =====================================================================
// /portal — root redirect
// =====================================================================
// If the patient has a portal token in localStorage, redirect to the
// dashboard; otherwise to the login page. This is a client component
// because we need to check localStorage.
// =====================================================================
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getPortalToken } from "@/lib/patient-portal/client";

export default function PortalRootPage() {
  const router = useRouter();
  useEffect(() => {
    if (getPortalToken()) {
      router.replace("/portal/dashboard");
    } else {
      router.replace("/portal/login");
    }
  }, [router]);
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-500 text-sm">Loading...</p>
    </div>
  );
}

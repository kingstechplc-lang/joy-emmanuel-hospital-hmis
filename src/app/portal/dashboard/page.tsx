"use client";

// =====================================================================
// PATIENT PORTAL — Dashboard
// =====================================================================
// Overview page for logged-in patients. Shows:
//   - Welcome banner with patient name + patient number
//   - 3 quick stats: upcoming appointments, pending lab results,
//     outstanding balance
//   - "What's new" feed: latest released lab results, recent
//     invoices, upcoming appointment
// =====================================================================
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, FlaskConical, Receipt, ChevronRight, LogOut, User } from "lucide-react";
import { getPortalToken, portalFetchJson, portalLogout } from "@/lib/patient-portal/client";
import { formatDate, formatCurrency, safeJson } from "@/components/ui-helpers";

export default function PortalDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Guard: if no token, redirect to login
    if (!getPortalToken()) {
      router.replace("/portal/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await portalFetchJson("/api/portal/me");
        if (data.needsIdentity) {
          // Account exists but no patient linked — show a "pending
          // identity" state instead of crashing on null patient
          setMe({ ...data, patient: null });
        } else {
          setMe(data);
        }
      } catch (e) {
        // Token probably expired — portalFetchJson redirects on 401
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    );
  }

  const patient = me?.patient;

  // Pending identity banner
  if (me?.needsIdentity || !patient) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-3">
              <User className="w-9 h-9 text-amber-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">
              Account Pending Verification
            </h1>
            <p className="text-sm text-slate-600 mb-4">
              We couldn't automatically link your phone number to a patient record.
              Please visit our <strong>Records Desk</strong> with a valid ID to complete setup.
              Once linked, you'll be able to view your lab results, appointments, and invoices here.
            </p>
            <Button
              onClick={portalLogout}
              variant="outline"
              className="w-full"
            >
              <LogOut className="w-4 h-4 mr-2" /> Log Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fullName = `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-sky-50">
      {/* Top app bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Welcome,</p>
            <p className="font-semibold text-slate-900">{fullName}</p>
          </div>
          <Button
            onClick={portalLogout}
            variant="ghost"
            size="sm"
            className="text-slate-600"
          >
            <LogOut className="w-4 h-4 mr-1" /> Log Out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Hero / patient banner */}
        <Card className="bg-gradient-to-r from-teal-600 to-sky-600 border-0">
          <CardContent className="p-6 text-white">
            <p className="text-sm text-white/80">Patient Number</p>
            <p className="text-2xl font-mono font-bold tracking-wider">
              {patient.patientNumber}
            </p>
            <p className="text-xs text-white/70 mt-2">
              {patient.sex ? `Sex: ${patient.sex}` : ""}
              {patient.dateOfBirth ? ` • DOB: ${new Date(patient.dateOfBirth).toLocaleDateString()}` : ""}
            </p>
          </CardContent>
        </Card>

        {/* Quick stats — 3 cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <QuickStatCard
            title="Upcoming Appointments"
            icon={<Calendar className="w-5 h-5" />}
            onClick={() => router.push("/portal/appointments")}
            accent="bg-blue-50 text-blue-700"
          />
          <QuickStatCard
            title="Lab Results"
            icon={<FlaskConical className="w-5 h-5" />}
            onClick={() => router.push("/portal/lab-results")}
            accent="bg-purple-50 text-purple-700"
          />
          <QuickStatCard
            title="Invoices & Receipts"
            icon={<Receipt className="w-5 h-5" />}
            onClick={() => router.push("/portal/invoices")}
            accent="bg-emerald-50 text-emerald-700"
          />
        </div>

        {/* Quick links */}
        <Card>
          <CardContent className="p-4">
            <h2 className="font-semibold text-slate-900 mb-3">Quick links</h2>
            <div className="space-y-2">
              <QuickLinkRow
                icon={<Calendar className="w-4 h-4 text-blue-600" />}
                title="View upcoming appointments"
                onClick={() => router.push("/portal/appointments?status=upcoming")}
              />
              <QuickLinkRow
                icon={<FlaskConical className="w-4 h-4 text-purple-600" />}
                title="See my latest lab results"
                onClick={() => router.push("/portal/lab-results")}
              />
              <QuickLinkRow
                icon={<Receipt className="w-4 h-4 text-emerald-600" />}
                title="Check outstanding balance"
                onClick={() => router.push("/portal/invoices?status=unpaid")}
              />
            </div>
          </CardContent>
        </Card>

        {/* Help / contact */}
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500">
              Need help? Call our front desk at the hospital. For medical emergencies, dial 112 or visit the nearest emergency unit.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function QuickStatCard({ title, icon, onClick, accent }: { title: string; icon: React.ReactNode; onClick: () => void; accent: string; }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-teal-300 transition-all"
    >
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${accent} mb-2`}>
        {icon}
      </div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-0.5">
        View <ChevronRight className="w-3 h-3" />
      </p>
    </button>
  );
}

function QuickLinkRow({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void; }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 text-left"
    >
      {icon}
      <span className="text-sm text-slate-700 flex-1">{title}</span>
      <ChevronRight className="w-4 h-4 text-slate-400" />
    </button>
  );
}

"use client";

// =====================================================================
// WidgetQuickActions — "Quick Actions" panel widget
// =====================================================================
// Renders role-appropriate navigation shortcuts as a grid of buttons.
// Clicking a button navigates to the corresponding view.
//
// The quick-actions list is filtered by the user's permissions (same
// logic as the existing dashboard-view.tsx ALL_QUICK_ACTIONS).
// =====================================================================

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, UserPlus, Calendar, BedDouble, Activity, Pill, FlaskConical,
  Receipt, Boxes, ScrollText, Shield, BarChart3, UserCog, FileText,
  Clock, Stethoscope, ClipboardCheck, ArrowRight,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";

const ALL_QUICK_ACTIONS: { label: string; view: any; icon: any; perm: string }[] = [
  { label: "Records Desk", view: "records_desk", icon: ClipboardCheck, perm: "patient.view" },
  { label: "Register Patient", view: "patient_new", icon: UserPlus, perm: "patient.create" },
  { label: "Find Patient", view: "patients", icon: Users, perm: "patient.view" },
  { label: "New Encounter", view: "encounters", icon: Activity, perm: "encounter.create" },
  { label: "Book Appointment", view: "appointments", icon: Calendar, perm: "appointment.create" },
  { label: "Triage & Vitals", view: "triage", icon: Activity, perm: "triage.view" },
  { label: "Consultation", view: "consultations", icon: Stethoscope, perm: "clinical.create" },
  { label: "Lab Orders", view: "lab_orders", icon: FlaskConical, perm: "lab.order" },
  { label: "Dispense", view: "dispense", icon: Pill, perm: "pharmacy.dispense" },
  { label: "New Invoice", view: "billing_invoices", icon: Receipt, perm: "billing.create" },
  { label: "Beds", view: "beds", icon: BedDouble, perm: "bed.manage" },
  { label: "Inventory", view: "inventory", icon: Boxes, perm: "inventory.view" },
  { label: "Audit Logs", view: "audit_logs", icon: ScrollText, perm: "audit.view" },
  { label: "Security", view: "security", icon: Shield, perm: "security.dashboard" },
  { label: "Reports", view: "reports", icon: BarChart3, perm: "report.view" },
  { label: "Users", view: "settings_users", icon: UserCog, perm: "user.view" },
  { label: "Documents", view: "documents", icon: FileText, perm: "document.view" },
  { label: "Tasks", view: "tasks", icon: Clock, perm: "task.assign" },
];

export function WidgetQuickActions() {
  const setView = useAppStore((s) => s.setView);
  const { data: session } = useSession();
  const user = session?.user as any;
  const perms: string[] = user?.permissions || [];
  const isSuperAdmin = user?.roles?.includes("super_admin");
  const has = (p: string) => isSuperAdmin || perms.includes(p);
  const visibleActions = ALL_QUICK_ACTIONS.filter((a) => has(a.perm));

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quick Actions</CardTitle>
        <CardDescription>Operations available to your role</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {visibleActions.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            No quick actions available for your role.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {visibleActions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.view}
                  onClick={() => setView(a.view)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition group"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-600 transition">
                    <Icon className="w-5 h-5 text-emerald-600 group-hover:text-white transition" />
                  </div>
                  <span className="text-xs font-medium text-slate-700 text-center">
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

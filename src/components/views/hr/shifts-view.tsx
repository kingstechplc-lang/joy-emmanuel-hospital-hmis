"use client";
// =====================================================================
// SHIFTS & LEAVE — ADVANCED WORKFORCE MANAGEMENT
//   Main container with 19 navigation sections (Part 160 of spec).
//   Replaces the legacy 2-tab view with a comprehensive multi-section UI.
// =====================================================================
import { useState, type ReactElement } from "react";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, Calendar, CalendarDays, FileText, ArrowRightLeft,
  Shield, Phone, UserCheck, Plane, BookOpen, Settings, Clock, AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { WorkforceDashboard } from "./workforce/workforce-dashboard";
import { ShiftsTab } from "./workforce/shifts-tab";
import { LeaveTab } from "./workforce/leave-tab";
import { RosterTab } from "./workforce/roster-tab";
import {
  SwapsTab, CoverageTab, OnCallTab, LeaveBalancesTab, CalendarTab,
  SettingsTab, AvailabilityTab,
} from "./workforce/workforce-tabs";
import { usePermissions } from "./workforce/workforce-helpers";
import { ModuleHelp } from "@/components/ui-helpers";

type Section = {
  id: string;
  label: string;
  icon: any;
  component: () => ReactElement;
  permission?: string[];
  group: "main" | "leave" | "config";
};

const SECTIONS: Section[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, component: () => <WorkforceDashboard />, permission: ["staff.view"], group: "main" },
  { id: "shifts", label: "Shift Assignments", icon: Users, component: () => <ShiftsTab />, permission: ["staff.view"], group: "main" },
  { id: "roster", label: "Duty Roster", icon: FileText, component: () => <RosterTab />, permission: ["staff.view"], group: "main" },
  { id: "calendar", label: "Shift Calendar", icon: Calendar, component: () => <CalendarTab />, permission: ["staff.view"], group: "main" },
  { id: "on-call", label: "On-Call", icon: Phone, component: () => <OnCallTab />, permission: ["staff.view"], group: "main" },
  { id: "swaps", label: "Shift Swaps", icon: ArrowRightLeft, component: () => <SwapsTab />, permission: ["staff.view"], group: "main" },
  { id: "coverage", label: "Coverage", icon: Shield, component: () => <CoverageTab />, permission: ["staff.view"], group: "main" },
  { id: "availability", label: "Staff Availability", icon: UserCheck, component: () => <AvailabilityTab />, permission: ["staff.view"], group: "main" },
  { id: "leave", label: "Leave Requests", icon: Plane, component: () => <LeaveTab />, permission: ["staff.view"], group: "leave" },
  { id: "balances", label: "Leave Balances", icon: BookOpen, component: () => <LeaveBalancesTab />, permission: ["staff.view"], group: "leave" },
  { id: "settings", label: "Settings", icon: Settings, component: () => <SettingsTab />, permission: ["staff.view"], group: "config" },
];

export function ShiftsView() {
  const [section, setSection] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { can } = usePermissions();
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);

  const visibleSections = SECTIONS.filter((s) => !s.permission || can(s.permission));
  const current = visibleSections.find((s) => s.id === section) || visibleSections[0];

  // Group sections
  const groups: Record<string, Section[]> = { main: [], leave: [], config: [] };
  for (const s of visibleSections) {
    groups[s.group].push(s);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 text-white p-5 shadow-lg fade-in-up relative overflow-hidden">
        <div className="absolute top-2 right-4 text-white/15 pointer-events-none">
          <CalendarDays className="w-20 h-20" strokeWidth={1.5} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-5 h-5 text-white/90" />
            <h2 className="text-xl font-bold">Shifts &amp; Leave — Workforce Management</h2>
          </div>
          <p className="text-sm text-white/80">
            Comprehensive scheduling, duty roster, shift assignments, leave management, coverage, on-call, and workforce planning.
            {!activeFacilityId && <span className="ml-2 text-amber-200 font-medium">⚠ Select a facility from the top bar to begin.</span>}
          </p>
        </div>
      </div>

      {/* Help */}

      <ModuleHelp
        title="Shifts & Leave"
        sections={[
          { title: "Dashboard", content: "Shows real-time statistics for today's shifts and leave. Includes total shifts, scheduled staff, on-duty, night shift, on-call, unfilled shifts, pending swaps, coverage requests, and overtime hours. Also shows today's staffing list and on-call assignments." },
          { title: "Shift Assignments", content: "Create individual shift assignments for staff. The system validates conflicts (overlapping shifts, insufficient rest, leave conflicts) before allowing assignment. Each shift can be marked as morning, evening, night, or on-call." },
          { title: "Duty Roster", content: "Create rosters (groups of shifts for a date range). Rosters go through: Draft \u2192 Review \u2192 Approved \u2192 Published \u2192 Locked. Publishing notifies affected staff. Locking prevents further changes." },
          { title: "Shift Calendar", content: "Combined monthly calendar showing shifts, leave, holidays, and on-call assignments. Color-coded by type. Click a date to see all events." },
          { title: "Shift Swaps", content: "Staff can request swaps with another staff member. Workflow: Requester submits \u2192 Target accepts \u2192 Supervisor approves. The system checks for conflicts before approving." },
          { title: "Coverage", content: "When staff cannot attend a shift, create a coverage request. The system suggests replacement staff ranked by suitability (same facility, profession match, availability, workload)." },
          { title: "Leave Management", content: "Submit leave requests with balance checks and conflict detection. Approval workflow: Pending \u2192 Approved/Rejected. Upon approval, leave balance is automatically deducted and staff status changes to on_leave." },
          { title: "Settings", content: "Configure shift types, leave types, public holidays, staffing requirements (minimum staffing per department/shift), and leave policies (accrual, carry-forward, negative balance rules). Use 'Seed Defaults' to load standard configurations." },
        ]}
      />


      {/* Desktop nav */}
      <div className="hidden md:block">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
          {groups.main.map((s) => (
            <NavButton key={s.id} section={s} active={current.id === s.id} onClick={() => setSection(s.id)} />
          ))}
          <span className="border-l border-slate-300 mx-1" />
          {groups.leave.map((s) => (
            <NavButton key={s.id} section={s} active={current.id === s.id} onClick={() => setSection(s.id)} />
          ))}
          <span className="border-l border-slate-300 mx-1" />
          {groups.config.map((s) => (
            <NavButton key={s.id} section={s} active={current.id === s.id} onClick={() => setSection(s.id)} />
          ))}
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden">
        <Button variant="outline" className="w-full justify-between" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
          <span className="flex items-center gap-2">
            {current && <current.icon className="w-4 h-4" />}
            {current?.label}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${mobileNavOpen ? "rotate-180" : ""}`} />
        </Button>
        {mobileNavOpen && (
          <div className="mt-2 p-2 border rounded-lg bg-white shadow-sm space-y-1">
            {Object.entries(groups).map(([groupKey, groupSections]) => (
              <div key={groupKey}>
                {groupSections.length > 0 && (
                  <>
                    <div className="text-xs font-semibold text-slate-500 uppercase px-2 py-1">{groupKey}</div>
                    {groupSections.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setSection(s.id); setMobileNavOpen(false); }}
                        className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${current.id === s.id ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-slate-50 text-slate-700"}`}
                      >
                        <s.icon className="w-4 h-4" />
                        {s.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active section */}
      <div>{current?.component()}</div>
    </div>
  );
}

function NavButton({ section, active, onClick }: { section: Section; active: boolean; onClick: () => void }) {
  const Icon = section.icon;
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-t-md text-sm flex items-center gap-1.5 transition-colors ${
        active
          ? "bg-blue-600 text-white font-medium shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <Icon className="w-4 h-4" />
      {section.label}
    </button>
  );
}

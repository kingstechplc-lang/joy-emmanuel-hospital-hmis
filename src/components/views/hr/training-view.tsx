"use client";
// =====================================================================
// TRAINING & STAFF DEVELOPMENT — ADVANCED MODULE
//   Main container with multi-section navigation (Part 120 of spec).
// =====================================================================
import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, BookOpen, CalendarDays, Users, Award, Send,
  Building2, BarChart3, Settings, ChevronDown, GraduationCap,
} from "lucide-react";
import { TrainingDashboard } from "./training/training-dashboard";
import {
  ProgramsTab, SessionsTab, EnrollmentsTab, CertificatesTab,
  RequestsTab, ProvidersTrainersTab, SettingsTab,
} from "./training/training-tabs";
import { usePermissions } from "./training/training-helpers";
import { ModuleHelp } from "@/components/ui-helpers";

type Section = {
  id: string;
  label: string;
  icon: any;
  component: () => ReactElement;
  permission?: string[];
  group: "main" | "admin" | "config";
};

const SECTIONS: Section[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, component: () => <TrainingDashboard />, permission: ["staff.view"], group: "main" },
  { id: "programs", label: "Training Programs", icon: BookOpen, component: () => <ProgramsTab />, permission: ["staff.view"], group: "main" },
  { id: "sessions", label: "Sessions", icon: CalendarDays, component: () => <SessionsTab />, permission: ["staff.view"], group: "main" },
  { id: "enrollments", label: "Enrollments", icon: Users, component: () => <EnrollmentsTab />, permission: ["staff.view"], group: "main" },
  { id: "certificates", label: "Certificates", icon: Award, component: () => <CertificatesTab />, permission: ["staff.view"], group: "main" },
  { id: "requests", label: "Training Requests", icon: Send, component: () => <RequestsTab />, permission: ["staff.view"], group: "admin" },
  { id: "providers", label: "Providers & Trainers", icon: Building2, component: () => <ProvidersTrainersTab />, permission: ["staff.view"], group: "admin" },
  { id: "settings", label: "Settings", icon: Settings, component: () => <SettingsTab />, permission: ["staff.view"], group: "config" },
];

export function TrainingView() {
  const [section, setSection] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { can } = usePermissions();

  const visibleSections = SECTIONS.filter((s) => !s.permission || can(s.permission));
  const current = visibleSections.find((s) => s.id === section) || visibleSections[0];

  const groups: Record<string, Section[]> = { main: [], admin: [], config: [] };
  for (const s of visibleSections) {
    groups[s.group].push(s);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 text-white p-5 shadow-lg fade-in-up relative overflow-hidden">
        <div className="absolute top-2 right-4 text-white/15 pointer-events-none">
          <GraduationCap className="w-20 h-20" strokeWidth={1.5} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap className="w-5 h-5 text-white/90" />
            <h2 className="text-xl font-bold">Training &amp; Staff Development</h2>
          </div>
          <p className="text-sm text-white/80">
            Manage training programs, sessions, enrollments, certificates, competencies, CPD, and compliance.
          </p>
        </div>
      </div>

      {/* Help */}

      <ModuleHelp
        title="Training & Staff Development"
        sections={[
          { title: "Dashboard", content: "Real-time training statistics: total programs, upcoming sessions, enrollments, certificates, CPD records, mandatory compliance rate, and expiring certifications." },
          { title: "Training Programs", content: "Create configurable training programs with category, type, delivery method, duration, CPD points, validity period, assessment requirements, and certificate requirements." },
          { title: "Sessions", content: "Schedule training sessions for programs. Each session has a date, time, venue, trainer, and capacity. Enrollments are tracked per session." },
          { title: "Enrollments", content: "Enroll staff in training programs/sessions. Workflow: Pending \u2192 Approved \u2192 Attended \u2192 Completed. Auto-waitlist when session is full." },
          { title: "Certificates", content: "Issue certificates with auto-generated unique certificate numbers and verification codes. Supports revocation with reason. Renewal creates a new certificate and archives the old one." },
          { title: "Providers & Trainers", content: "Manage external training providers (organizations) and trainers (internal staff or external individuals)." },
          { title: "Settings", content: "Seed default training programs (BLS, ACLS, IPC, Fire Safety, etc.) and competencies. Configure training requirements and competency definitions." },
        ]}
      />


      {/* Desktop nav */}
      <div className="hidden md:block">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
          {groups.main.map((s) => (
            <NavButton key={s.id} section={s} active={current.id === s.id} onClick={() => setSection(s.id)} />
          ))}
          <span className="border-l border-slate-300 mx-1" />
          {groups.admin.map((s) => (
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
                        className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${current.id === s.id ? "bg-purple-50 text-purple-700 font-medium" : "hover:bg-slate-50 text-slate-700"}`}
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
          ? "bg-purple-600 text-white font-medium shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <Icon className="w-4 h-4" />
      {section.label}
    </button>
  );
}

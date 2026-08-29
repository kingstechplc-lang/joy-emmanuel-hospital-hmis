"use client";
// =====================================================================
// CERTIFICATIONS — ADVANCED MODULE
//   Main container with multi-section navigation (Part 95 of spec).
// =====================================================================
import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Award, ShieldCheck, AlertTriangle, Building2,
  Settings, ChevronDown, RefreshCcw, FileCheck, Clock, XCircle,
} from "lucide-react";
import { CertDashboard } from "./certifications/cert-dashboard";
import { CertRecordsTab, CertSettingsTab } from "./certifications/cert-tabs";
import { usePermissions } from "./certifications/cert-helpers";

type Section = {
  id: string;
  label: string;
  icon: any;
  component: () => ReactElement;
  permission?: string[];
  group: "main" | "config";
};

const SECTIONS: Section[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, component: () => <CertDashboard />, permission: ["staff.view"], group: "main" },
  { id: "records", label: "All Certifications", icon: Award, component: () => <CertRecordsTab />, permission: ["staff.view"], group: "main" },
  { id: "settings", label: "Settings", icon: Settings, component: () => <CertSettingsTab />, permission: ["staff.view"], group: "config" },
];

export function CertificationsView() {
  const [section, setSection] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { can } = usePermissions();

  const visibleSections = SECTIONS.filter((s) => !s.permission || can(s.permission));
  const current = visibleSections.find((s) => s.id === section) || visibleSections[0];

  const groups: Record<string, Section[]> = { main: [], config: [] };
  for (const s of visibleSections) {
    groups[s.group].push(s);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white p-5 shadow-lg fade-in-up relative overflow-hidden">
        <div className="absolute top-2 right-4 text-white/15 pointer-events-none">
          <ShieldCheck className="w-20 h-20" strokeWidth={1.5} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-white/90" />
            <h2 className="text-xl font-bold">Certifications &amp; Credentials</h2>
          </div>
          <p className="text-sm text-white/80">
            Manage professional licenses, certifications, credentials, verification, renewal, expiry monitoring, and compliance.
          </p>
        </div>
      </div>

      {/* Desktop nav */}
      <div className="hidden md:block">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
          {groups.main.map((s) => (
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
                        className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${current.id === s.id ? "bg-orange-50 text-orange-700 font-medium" : "hover:bg-slate-50 text-slate-700"}`}
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
          ? "bg-orange-600 text-white font-medium shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <Icon className="w-4 h-4" />
      {section.label}
    </button>
  );
}

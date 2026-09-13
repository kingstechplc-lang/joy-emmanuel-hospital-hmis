"use client";

// =====================================================================
// WidgetRecentPatients — "Recent Patients" list widget
// =====================================================================
// Renders the most recently registered patients as a clickable list.
// Click a row → navigates to Patient 360 for that patient.
//
// Config schema:
//   maxItems (default 6) — maximum number of patients to show
// =====================================================================

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { EmptyState, LoadingState } from "@/components/ui-helpers";

export function WidgetRecentPatients({
  stats,
  isLoading,
  config,
  onConfigure,
}: {
  stats: any;
  isLoading: boolean;
  config: { maxItems?: number };
  onConfigure?: () => void;
}) {
  const setView = useAppStore((s) => s.setView);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const max = config.maxItems || 6;
  const patients = (stats?.recentPatients || []).slice(0, max);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" /> Recent Patients
          </CardTitle>
          <CardDescription>Latest registered patients</CardDescription>
        </div>
        <div className="flex items-center gap-1">
          {onConfigure && (
            <Button variant="ghost" size="sm" onClick={onConfigure} className="h-7 px-2 text-xs">
              Configure
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setView("patients")} className="h-7 px-2 gap-1 text-xs">
            View all <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {isLoading ? (
          <LoadingState rows={3} />
        ) : patients.length === 0 ? (
          <EmptyState title="No patients yet" description="New patients will appear here once registered." icon={Users} />
        ) : (
          <div className="space-y-2">
            {patients.map((p: any) => (
              <div
                key={p.id}
                onClick={() => {
                  selectPatient(p.id);
                  setView("patient_360");
                }}
                className="flex items-center justify-between p-3 rounded-md border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-semibold flex items-center justify-center">
                    {p.firstName[0]}
                    {p.lastName[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.patientNumber} • {p.sex || "—"} • {p.phone || "No phone"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline">{p.status}</Badge>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {new Date(p.registrationDate).toLocaleDateString("en-GB")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

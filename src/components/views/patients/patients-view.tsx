"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, User } from "lucide-react";
import { EmptyState, LoadingState, ErrorState, StatusBadge, calculateAge } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export function PatientsView() {
  const setView = useAppStore((s) => s.setView);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce search input
  const handleSearch = (v: string) => {
    setQuery(v);
    if (window) {
      const w = window as any;
      if (w.__patientSearchTimer) clearTimeout(w.__patientSearchTimer);
      w.__patientSearchTimer = setTimeout(() => setDebouncedQuery(v), 350);
    }
  };

  const searchParam = debouncedQuery ? `?q=${encodeURIComponent(debouncedQuery)}` : "";
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["patients-list", debouncedQuery],
    queryFn: () => fetchJson(`/api/patients${searchParam}`),
    enabled: true,
  });

  const patients: any[] = data?.patients || [];

  const openPatient = (id: string) => {
    selectPatient(id);
    setView("patient_360");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Patients</h2>
          <p className="text-sm text-slate-500">Master patient index — search by name, patient number, phone, or Ghana Card</p>
        </div>
        <Button onClick={() => setView("patient_new")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> Register New Patient
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by patient number, name, phone, or Ghana Card..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load patients" onRetry={() => refetch()} />
      ) : patients.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title={debouncedQuery ? "No matching patients" : "No patients yet"}
              description={debouncedQuery ? `No patients match "${debouncedQuery}". Try a different search.` : "Register your first patient to get started."}
              action={
                <Button onClick={() => setView("patient_new")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="w-4 h-4" /> Register New Patient
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Patient #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Age</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Sex</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Phone</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Encounters</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => openPatient(p.id)}
                      className="border-b hover:bg-emerald-50/50 cursor-pointer transition-colors"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-sm flex-shrink-0">
                            {p.firstName?.[0]?.toUpperCase()}
                            {p.lastName?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">
                              {p.firstName} {p.middleName ? `${p.middleName} ` : ""}{p.lastName}
                            </div>
                            <div className="text-xs text-slate-500">{p.patientNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-slate-600">{p.patientNumber}</td>
                      <td className="p-3 text-slate-700">{calculateAge(p.dateOfBirth)}</td>
                      <td className="p-3">
                        <span className="capitalize text-slate-700">{p.sex || "—"}</span>
                      </td>
                      <td className="p-3 text-slate-700">{p.phone || "—"}</td>
                      <td className="p-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="p-3 text-right">
                        <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                          {p._count?.encounters ?? 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && patients.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{patients.length} patient{patients.length === 1 ? "" : "s"} shown</span>
          <Button variant="ghost" size="sm" onClick={() => setView("patient_new")} className="gap-1 text-emerald-700">
            <User className="w-3.5 h-3.5" /> Register new patient
          </Button>
        </div>
      )}
    </div>
  );
}

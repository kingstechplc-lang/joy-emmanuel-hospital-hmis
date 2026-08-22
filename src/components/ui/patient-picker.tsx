"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, CheckCircle2, AlertCircle, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/required-label";
import { safeJson, calculateAge } from "@/components/ui-helpers";

async function fetchPatients(q: string) {
  const url = `/api/patients?q=${encodeURIComponent(q)}&limit=15`;
  const res = await fetch(url);
  if (!res.ok) return { patients: [] };
  const data = await safeJson(res);
  return data;
}

export interface PatientPickerValue {
  patientId: string | null;
  patientName: string;
  patientAge?: number | null;
  patientSex?: string | null;
  patientPhone?: string | null;
  patientNumber?: string | null;
}

interface PatientPickerProps {
  label?: string;
  required?: boolean;
  placeholder?: string;
  value: PatientPickerValue | null;
  onChange: (value: PatientPickerValue | null) => void;
  allowManual?: boolean; // allow free-text entry if patient not found
  disabled?: boolean;
  className?: string;
  onRegisterNew?: () => void; // when provided, shows a "Register new patient" shortcut button
}

/**
 * Reusable patient search & select component.
 * Searches /api/patients?q=... and lets the user pick a real patient record.
 * On select, returns { patientId, patientName, patientAge, patientSex, patientPhone, patientNumber }
 * for the parent form to use in API payloads.
 *
 * If allowManual is true and no patient is found, the user can fall back to
 * typing a free-text name (patientId will be null in that case).
 *
 * If onRegisterNew is provided, a "Register new patient" button appears in the
 * no-results state, letting the user jump to patient registration without
 * leaving the current form.
 */
export function PatientPicker({
  label = "Patient",
  required = false,
  placeholder = "Search by patient name, MRN, phone, or Ghana Card...",
  value,
  onChange,
  allowManual = true,
  disabled = false,
  className = "",
  onRegisterNew,
}: PatientPickerProps) {
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query]);

  // If a value is already set, show the patient chip
  const hasPatient = !!value?.patientId;
  const isManualEntry = !!value && !value.patientId && !!value.patientName;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["patient-picker-search", debouncedQuery],
    queryFn: () => fetchPatients(debouncedQuery),
    enabled: debouncedQuery.length >= 2 && showResults && !hasPatient && !isManualEntry,
    staleTime: 30_000,
  });

  const patients: any[] = data?.patients || [];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectPatient = (p: any) => {
    const patientName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
    const ageRaw = p.dateOfBirth ? calculateAge(p.dateOfBirth) : null;
    const ageNum = typeof ageRaw === "number" ? ageRaw : null;
    onChange({
      patientId: p.id,
      patientName,
      patientAge: ageNum,
      patientSex: p.sex || null,
      patientPhone: p.phone || null,
      patientNumber: p.patientNumber || null,
    });
    setQuery("");
    setShowResults(false);
    setManualMode(false);
  };

  const clearPatient = () => {
    onChange(null);
    setQuery("");
    setManualMode(false);
    setShowResults(true);
  };

  const switchToManual = () => {
    setManualMode(true);
    setShowResults(false);
    onChange({ patientId: null, patientName: query });
  };

  // ---- Render: patient already selected (chip) ----
  if (hasPatient || isManualEntry) {
    return (
      <div className={`relative ${className}`}>
        {label && <FieldLabel required={required}>{label}</FieldLabel>}
        <div className={`flex items-center gap-2 p-2 border rounded-lg ${isManualEntry ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
          {isManualEntry ? (
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 truncate">{value?.patientName}</div>
            <div className="text-xs text-slate-500 truncate">
              {isManualEntry ? (
                <span className="text-amber-700">Manual entry — not linked to a patient record</span>
              ) : (
                <>
                  {value?.patientNumber && <span className="font-mono">{value.patientNumber}</span>}
                  {value?.patientAge != null && value?.patientAge !== undefined && <span> · {value.patientAge}y</span>}
                  {value?.patientSex && <span> · {value.patientSex}</span>}
                  {value?.patientPhone && <span> · {value.patientPhone}</span>}
                </>
              )}
            </div>
          </div>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={clearPatient} className="h-7 px-2">
              <X className="w-3.5 h-3.5" /> Change
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ---- Render: search input + dropdown ----
  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && <FieldLabel required={required}>{label}</FieldLabel>}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none z-10" />
        <Input
          placeholder={placeholder}
          value={manualMode ? (value?.patientName || "") : query}
          onChange={(e) => {
            if (manualMode) {
              onChange({ patientId: null, patientName: e.target.value });
            } else {
              setQuery(e.target.value);
              setShowResults(true);
            }
          }}
          onFocus={() => !manualMode && setShowResults(true)}
          disabled={disabled}
          className="pl-8"
        />
      </div>

      {showResults && !manualMode && debouncedQuery.length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl">
          {isLoading || isFetching ? (
            <div className="p-3 text-xs text-slate-500 text-center">Searching...</div>
          ) : patients.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 text-center space-y-2">
              <p>No patients found matching &quot;{debouncedQuery}&quot;.</p>
              <div className="flex flex-col gap-1 items-center">
                {onRegisterNew && (
                  <button type="button" onClick={onRegisterNew} className="text-emerald-600 hover:underline font-medium flex items-center gap-1">
                    <UserPlus className="w-3 h-3" /> Register new patient →
                  </button>
                )}
                {allowManual && (
                  <button type="button" onClick={switchToManual} className="text-slate-600 hover:underline">
                    Enter name manually instead →
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {patients.map((p) => {
                const name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
                const ageRaw = p.dateOfBirth ? calculateAge(p.dateOfBirth) : null;
                const age = typeof ageRaw === "number" ? ageRaw : null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPatient(p)}
                    className="w-full text-left p-2.5 hover:bg-emerald-50 border-b border-slate-100 last:border-0 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-xs flex-shrink-0">
                        {p.firstName?.[0]?.toUpperCase()}{p.lastName?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{name}</div>
                        <div className="text-xs text-slate-500 truncate">
                          <span className="font-mono">{p.patientNumber}</span>
                          {age != null && <span> · {age}y</span>}
                          {p.sex && <span> · {p.sex}</span>}
                          {p.phone && <span> · {p.phone}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              <div className="border-t border-slate-200 p-1.5 flex flex-col gap-1">
                {onRegisterNew && (
                  <button
                    type="button"
                    onClick={onRegisterNew}
                    className="w-full text-left p-1.5 hover:bg-emerald-50 rounded text-xs text-emerald-700 font-medium flex items-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Register new patient
                  </button>
                )}
                {allowManual && (
                  <button
                    type="button"
                    onClick={switchToManual}
                    className="w-full text-left p-1.5 hover:bg-amber-50 rounded text-xs text-amber-700 font-medium"
                  >
                    Not found? Enter name manually →
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {manualMode && (
        <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Manual entry — patient will not be linked to a record.
        </p>
      )}
    </div>
  );
}

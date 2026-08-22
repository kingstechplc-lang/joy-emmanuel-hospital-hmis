"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Star, X, Plus, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FieldLabel } from "@/components/ui/required-label";
import { safeJson } from "@/components/ui-helpers";
import { toast } from "sonner";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { items: [] };
  return safeJson(res);
}

async function sendJson(url: string, method: string, body?: any) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await safeJson(res);
    throw new Error(e.error || e.detail || `Failed: ${res.status}`);
  }
  return safeJson(res);
}

const DIAGNOSIS_TYPES = [
  { value: "primary", label: "Primary", color: "bg-rose-100 text-rose-700 border-rose-300" },
  { value: "secondary", label: "Secondary", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "differential", label: "Differential", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "provisional", label: "Provisional", color: "bg-purple-100 text-purple-700 border-purple-300" },
  { value: "confirmed", label: "Confirmed", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: "final", label: "Final", color: "bg-slate-100 text-slate-700 border-slate-300" },
  { value: "principal", label: "Principal", color: "bg-rose-100 text-rose-700 border-rose-300" },
  { value: "admission", label: "Admission", color: "bg-indigo-100 text-indigo-700 border-indigo-300" },
  { value: "discharge", label: "Discharge", color: "bg-teal-100 text-teal-700 border-teal-300" },
  { value: "working", label: "Working", color: "bg-cyan-100 text-cyan-700 border-cyan-300" },
  { value: "historical", label: "Historical", color: "bg-slate-100 text-slate-500 border-slate-300" },
];

const CLINICAL_STATUSES = [
  { value: "active", label: "Active", color: "bg-emerald-100 text-emerald-700" },
  { value: "resolved", label: "Resolved", color: "bg-slate-100 text-slate-600" },
  { value: "relapse", label: "Relapse", color: "bg-amber-100 text-amber-700" },
  { value: "inactive", label: "Inactive", color: "bg-slate-100 text-slate-400" },
  { value: "ruled_out", label: "Ruled Out", color: "bg-rose-100 text-rose-700" },
];

const VERIFICATION_STATUSES = [
  { value: "unconfirmed", label: "Unconfirmed" },
  { value: "provisional", label: "Provisional" },
  { value: "differential", label: "Differential" },
  { value: "confirmed", label: "Confirmed" },
  { value: "refuted", label: "Refuted" },
];

function getTypeColor(type: string) {
  return DIAGNOSIS_TYPES.find((t) => t.value === type)?.color || "bg-slate-100 text-slate-700 border-slate-300";
}

function getStatusColor(status: string) {
  return CLINICAL_STATUSES.find((s) => s.value === status)?.color || "bg-slate-100 text-slate-600";
}

interface DiagnosisPickerProps {
  /** Patient ID — required for creating diagnoses */
  patientId: string;
  /** Encounter ID — required for creating diagnoses */
  encounterId: string;
  /** Optional specialty filter (e.g., "CARDIO") */
  specialty?: string;
  /** Whether the user can manage (create/edit) diagnoses */
  canManage?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Reusable Diagnosis Engine component.
 *
 * - Displays existing diagnoses for the encounter as colored chips
 * - Lets clinicians search the master catalog (with synonyms + favorites)
 * - On select, opens an "add diagnosis" dialog with type/status/notes
 * - Supports inline status changes (confirm, rule out, resolve)
 *
 * This is the SINGLE source of truth for diagnosis data — used by
 * Specialty Encounters, OPD/Consultations, Admissions, Discharges, Patient 360.
 */
export function DiagnosisPicker({
  patientId,
  encounterId,
  specialty,
  canManage = false,
  className = "",
}: DiagnosisPickerProps) {
  const qc = useQueryClient();
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [searchQuery]);

  // Fetch encounter diagnoses
  const { data: encDiagnosesData, isLoading: encLoading } = useQuery({
    queryKey: ["encounter-diagnoses", encounterId],
    queryFn: () => fetchJson(`/api/diagnoses?encounterId=${encounterId}&limit=100`),
    enabled: !!encounterId,
    staleTime: 0,
  });
  const diagnoses: any[] = encDiagnosesData?.items || [];

  // Search catalog
  const params = new URLSearchParams();
  if (debouncedQuery) params.set("q", debouncedQuery);
  if (specialty) params.set("specialty", specialty);
  params.set("limit", "30");
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ["diagnosis-catalog-search", debouncedQuery, specialty || ""],
    queryFn: () => fetchJson(`/api/diagnoses/catalog?${params.toString()}`),
    enabled: debouncedQuery.length >= 1 && showSearch,
    staleTime: 30_000,
  });
  const catalogItems: any[] = searchResults?.items || [];

  // Favorites
  const { data: favData } = useQuery({
    queryKey: ["diagnosis-favorites"],
    queryFn: () => fetchJson("/api/diagnoses/favorites"),
    enabled: canManage,
    staleTime: 60_000,
  });
  const favorites: any[] = favData?.items || [];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSearch(false);
        setShowFavorites(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addMutation = useMutation({
    mutationFn: (payload: any) => sendJson("/api/diagnoses", "POST", payload),
    onSuccess: () => {
      toast.success("Diagnosis added");
      setSearchQuery("");
      setShowSearch(false);
      qc.invalidateQueries({ queryKey: ["encounter-diagnoses", encounterId] });
      qc.invalidateQueries({ queryKey: ["patient-360"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => sendJson(`/api/diagnoses/${id}`, "PATCH", data),
    onSuccess: () => {
      toast.success("Diagnosis updated");
      qc.invalidateQueries({ queryKey: ["encounter-diagnoses", encounterId] });
      qc.invalidateQueries({ queryKey: ["patient-360"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sendJson(`/api/diagnoses/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("Diagnosis removed");
      qc.invalidateQueries({ queryKey: ["encounter-diagnoses", encounterId] });
      qc.invalidateQueries({ queryKey: ["patient-360"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFavorite = async (catalogId: string) => {
    try {
      const existing = favorites.find((f) => f.catalogId === catalogId);
      if (existing) {
        await sendJson(`/api/diagnoses/favorites?catalogId=${catalogId}`, "DELETE");
        toast.success("Removed from favorites");
      } else {
        await sendJson("/api/diagnoses/favorites", "POST", { catalogId });
        toast.success("Added to favorites");
      }
      qc.invalidateQueries({ queryKey: ["diagnosis-favorites"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const addDiagnosis = (catalogItem: any, overrides: any = {}) => {
    const type = overrides.diagnosisType || (diagnoses.length === 0 ? "primary" : "secondary");
    addMutation.mutate({
      patientId,
      encounterId,
      catalogId: catalogItem.id,
      diagnosisCode: catalogItem.code,
      diagnosisName: catalogItem.name,
      codeSystem: catalogItem.codeSystem,
      diagnosisType: type,
      isPrimary: type === "primary",
      isChronic: catalogItem.isChronicDefault,
      ...overrides,
    });
  };

  const addFreeText = (name: string, overrides: any = {}) => {
    const type = overrides.diagnosisType || (diagnoses.length === 0 ? "primary" : "secondary");
    addMutation.mutate({
      patientId,
      encounterId,
      diagnosisName: name,
      diagnosisType: type,
      isPrimary: type === "primary",
      ...overrides,
    });
  };

  // Group diagnoses by type for display
  const primaryDiagnoses = diagnoses.filter((d) => d.isPrimary || d.diagnosisType === "primary");
  const secondaryDiagnoses = diagnoses.filter((d) => !d.isPrimary && d.diagnosisType === "secondary");
  const differentialDiagnoses = diagnoses.filter((d) => d.diagnosisType === "differential");
  const provisionalDiagnoses = diagnoses.filter((d) => d.diagnosisType === "provisional");
  const otherDiagnoses = diagnoses.filter((d) =>
    !["primary", "secondary", "differential", "provisional"].includes(d.diagnosisType)
  );

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Existing diagnoses — chip display */}
      <div className="space-y-3">
        {encLoading ? (
          <p className="text-xs text-slate-400">Loading diagnoses...</p>
        ) : diagnoses.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No diagnoses recorded yet.</p>
        ) : (
          <>
            {primaryDiagnoses.length > 0 && (
              <DiagnosisGroup
                label="Primary" labelColor="text-rose-700"
                diagnoses={primaryDiagnoses}
                canManage={canManage}
                onStatusChange={(id, status, verification) => updateMutation.mutate({ id, data: { clinicalStatus: status, verificationStatus: verification } })}
                onDelete={(id) => { if (confirm("Remove this diagnosis? (Will be marked inactive to preserve history)")) deleteMutation.mutate(id); }}
              />
            )}
            {secondaryDiagnoses.length > 0 && (
              <DiagnosisGroup
                label="Secondary" labelColor="text-blue-700"
                diagnoses={secondaryDiagnoses}
                canManage={canManage}
                onStatusChange={(id, status, verification) => updateMutation.mutate({ id, data: { clinicalStatus: status, verificationStatus: verification } })}
                onDelete={(id) => { if (confirm("Remove this diagnosis?")) deleteMutation.mutate(id); }}
              />
            )}
            {provisionalDiagnoses.length > 0 && (
              <DiagnosisGroup
                label="Provisional" labelColor="text-purple-700"
                diagnoses={provisionalDiagnoses}
                canManage={canManage}
                onStatusChange={(id, status, verification) => updateMutation.mutate({ id, data: { clinicalStatus: status, verificationStatus: verification } })}
                onDelete={(id) => { if (confirm("Remove this diagnosis?")) deleteMutation.mutate(id); }}
              />
            )}
            {differentialDiagnoses.length > 0 && (
              <DiagnosisGroup
                label="Differential" labelColor="text-amber-700"
                diagnoses={differentialDiagnoses}
                canManage={canManage}
                onStatusChange={(id, status, verification) => updateMutation.mutate({ id, data: { clinicalStatus: status, verificationStatus: verification } })}
                onDelete={(id) => { if (confirm("Remove this diagnosis?")) deleteMutation.mutate(id); }}
              />
            )}
            {otherDiagnoses.length > 0 && (
              <DiagnosisGroup
                label="Other" labelColor="text-slate-700"
                diagnoses={otherDiagnoses}
                canManage={canManage}
                onStatusChange={(id, status, verification) => updateMutation.mutate({ id, data: { clinicalStatus: status, verificationStatus: verification } })}
                onDelete={(id) => { if (confirm("Remove this diagnosis?")) deleteMutation.mutate(id); }}
              />
            )}
          </>
        )}

        {/* Add diagnosis button */}
        {canManage && (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => { setShowSearch(!showSearch); setShowFavorites(false); }}
              className="gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            >
              <Plus className="w-3.5 h-3.5" /> Add Diagnosis
            </Button>
            {favorites.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => { setShowFavorites(!showFavorites); setShowSearch(false); }}
                className="gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                <Star className="w-3.5 h-3.5" /> Favorites ({favorites.length})
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Search dropdown */}
      {showSearch && canManage && (
        <div className="absolute left-0 right-0 z-50 mt-2 bg-white border border-slate-200 rounded-lg shadow-xl p-3 space-y-2 max-h-96 overflow-y-auto">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none z-10" />
            <Input
              autoFocus
              placeholder="Search diagnosis by name, code, or synonym (e.g., 'malaria', 'I10', 'HTN')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          {debouncedQuery.length >= 1 && (
            <>
              {searchLoading ? (
                <p className="text-xs text-slate-500 text-center py-3">Searching catalog...</p>
              ) : catalogItems.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-3 space-y-2">
                  <p>No catalog match for &quot;{debouncedQuery}&quot;.</p>
                  <button
                    type="button"
                    onClick={() => { addFreeText(debouncedQuery, { diagnosisType: diagnoses.length === 0 ? "primary" : "secondary", verificationStatus: "provisional" }); }}
                    className="text-emerald-600 hover:underline font-medium"
                    disabled={addMutation.isPending}
                  >
                    Add as free-text: &quot;{debouncedQuery}&quot; (provisional) →
                  </button>
                </div>
              ) : (
                <>
                  {catalogItems.map((item) => {
                    const isFav = favorites.some((f) => f.catalogId === item.id);
                    return (
                      <div key={item.id} className="border border-slate-100 rounded-lg p-2 hover:bg-emerald-50/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">{item.code}</span>
                              <span className="text-sm font-medium text-slate-900">{item.name}</span>
                              {item.isChronicDefault && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-rose-300 text-rose-700 bg-rose-50">CHRONIC</Badge>
                              )}
                              {item.category && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 capitalize">{item.category}</Badge>
                              )}
                            </div>
                            {item.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
                            className="flex-shrink-0 p-1"
                            title={isFav ? "Remove from favorites" : "Add to favorites"}
                          >
                            <Star className={`w-4 h-4 ${isFav ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-slate-500">Add as:</span>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-rose-300 text-rose-700 hover:bg-rose-50" disabled={addMutation.isPending}
                            onClick={() => addDiagnosis(item, { diagnosisType: "primary" })}>
                            Primary
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50" disabled={addMutation.isPending}
                            onClick={() => addDiagnosis(item, { diagnosisType: "secondary" })}>
                            Secondary
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-purple-300 text-purple-700 hover:bg-purple-50" disabled={addMutation.isPending}
                            onClick={() => addDiagnosis(item, { diagnosisType: "provisional", verificationStatus: "provisional" })}>
                            Provisional
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-amber-300 text-amber-700 hover:bg-amber-50" disabled={addMutation.isPending}
                            onClick={() => addDiagnosis(item, { diagnosisType: "differential", verificationStatus: "differential" })}>
                            Differential
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => { addFreeText(debouncedQuery, { diagnosisType: diagnoses.length === 0 ? "primary" : "secondary", verificationStatus: "provisional" }); }}
                    className="w-full text-left p-2 hover:bg-amber-50 rounded text-xs text-amber-700 border-t border-slate-200 font-medium"
                    disabled={addMutation.isPending}
                  >
                    Not in catalog? Add free-text: &quot;{debouncedQuery}&quot; →
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Favorites dropdown */}
      {showFavorites && canManage && (
        <div className="absolute left-0 right-0 z-50 mt-2 bg-white border border-slate-200 rounded-lg shadow-xl p-3 space-y-2 max-h-96 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-700 mb-1">Your favorite diagnoses</p>
          {favorites.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-3">No favorites yet. Star diagnoses from search to add them here.</p>
          ) : (
            favorites.map((fav) => {
              const item = fav.catalog;
              if (!item || !item.isActive) return null;
              return (
                <div key={fav.id} className="border border-slate-100 rounded-lg p-2 hover:bg-amber-50/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">{item.code}</span>
                        <span className="text-sm font-medium text-slate-900">{item.name}</span>
                        {item.isChronicDefault && (
                          <Badge variant="outline" className="text-[9px] py-0 px-1 border-rose-300 text-rose-700 bg-rose-50">CHRONIC</Badge>
                        )}
                      </div>
                    </div>
                    <button type="button" onClick={() => toggleFavorite(item.id)} title="Remove favorite">
                      <X className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-1 flex-wrap">
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-rose-300 text-rose-700 hover:bg-rose-50" disabled={addMutation.isPending}
                      onClick={() => addDiagnosis(item, { diagnosisType: "primary" })}>
                      Primary
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50" disabled={addMutation.isPending}
                      onClick={() => addDiagnosis(item, { diagnosisType: "secondary" })}>
                      Secondary
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-purple-300 text-purple-700 hover:bg-purple-50" disabled={addMutation.isPending}
                      onClick={() => addDiagnosis(item, { diagnosisType: "provisional", verificationStatus: "provisional" })}>
                        Provisional
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Diagnosis Group — displays diagnoses of a single type as chips
// =====================================================================
function DiagnosisGroup({
  label, labelColor, diagnoses, canManage, onStatusChange, onDelete,
}: {
  label: string;
  labelColor: string;
  diagnoses: any[];
  canManage: boolean;
  onStatusChange: (id: string, status: string, verification: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${labelColor}`}>{label}</p>
      <div className="space-y-1.5">
        {diagnoses.map((d) => (
          <div key={d.id} className="border border-slate-200 rounded-lg p-2 bg-white">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {d.diagnosisCode && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">{d.diagnosisCode}</span>
                  )}
                  <span className="text-sm font-medium text-slate-900">{d.diagnosisName}</span>
                  {d.isChronic && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-rose-300 text-rose-700 bg-rose-50">CHRONIC</Badge>
                  )}
                </div>
                {d.notes && <p className="text-xs text-slate-600 mt-1 italic">&ldquo;{d.notes}&rdquo;</p>}
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                  <span className={`px-1.5 py-0.5 rounded ${getStatusColor(d.clinicalStatus)}`}>{d.clinicalStatus.replace(/_/g, " ")}</span>
                  {d.verificationStatus && d.verificationStatus !== "confirmed" && (
                    <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">{d.verificationStatus}</span>
                  )}
                  <span>· {new Date(d.diagnosedAt).toLocaleDateString()}</span>
                  {d.catalog?.category && <span className="capitalize">· {d.catalog.category}</span>}
                </div>
              </div>
              {canManage && (
                <div className="flex flex-col gap-1 items-end">
                  <Select
                    value={d.clinicalStatus}
                    onValueChange={(v) => {
                      const verification = v === "ruled_out" ? "refuted" : v === "active" ? "confirmed" : d.verificationStatus;
                      onStatusChange(d.id, v, verification);
                    }}
                  >
                    <SelectTrigger className="h-6 w-[110px] text-[10px] px-2 py-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLINICAL_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    onClick={() => onDelete(d.id)}
                    className="text-[10px] text-rose-600 hover:text-rose-800 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

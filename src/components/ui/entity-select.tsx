"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, X, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/required-label";
import { safeJson } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { items: [] };
  return safeJson(res);
}

export interface EntitySelectValue {
  id: string | null;
  label: string;
  code?: string | null;
  [key: string]: any;
}

interface EntitySelectProps {
  /** Label for the field */
  label?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Currently selected value */
  value: EntitySelectValue | null;
  /** Change handler */
  onChange: (value: EntitySelectValue | null) => void;
  /** API endpoint URL (e.g., "/api/departments", "/api/medications?q=") — we append the search query */
  endpoint: string;
  /** Query parameter name for the search string (default: "q") */
  queryParam?: string;
  /** Additional query params to append (e.g., { status: "active" }) */
  queryParams?: Record<string, string>;
  /** Function to extract the display label from an API item */
  getLabel: (item: any) => string;
  /** Function to extract the unique id from an API item */
  getId: (item: any) => string;
  /** Function to extract a secondary subtitle line (optional) */
  getSubtitle?: (item: any) => string | null;
  /** Function to extract a code/badge (optional, shown as a small chip) */
  getCode?: (item: any) => string | null;
  /** Whether to allow free-text entry if no match found (default: false) */
  allowManual?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Additional className */
  className?: string;
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
}

/**
 * Generic searchable dropdown for ANY API-backed list.
 * Used for departments, lab tests, medications, services, etc.
 *
 * - Debounced search via the provided endpoint
 * - Selected item shown as a chip with a "Change" button
 * - Manual-entry fallback when allowManual is true
 * - Outside-click to close, accessible, responsive
 *
 * The endpoint should accept a search query and return { items: [...] }
 * (or { departments: [...] }, { medications: [...] }, etc. — we try both).
 */
export function EntitySelect({
  label,
  required = false,
  placeholder = "Search...",
  value,
  onChange,
  endpoint,
  queryParam = "q",
  queryParams = {},
  getLabel,
  getId,
  getSubtitle,
  getCode,
  allowManual = false,
  disabled = false,
  className = "",
  debounceMs = 300,
}: EntitySelectProps) {
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query, debounceMs]);

  const hasValue = !!value?.id;
  const isManualEntry = !!value && !value.id && !!value.label;

  // Build the search URL
  const searchUrl = (() => {
    const params = new URLSearchParams(queryParams);
    if (debouncedQuery) params.set(queryParam, debouncedQuery);
    const sep = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${sep}${params.toString()}`;
  })();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["entity-select", endpoint, debouncedQuery, JSON.stringify(queryParams)],
    queryFn: () => fetchJson(searchUrl),
    enabled: debouncedQuery.length >= 1 && showResults && !hasValue && !isManualEntry,
    staleTime: 30_000,
  });

  // The API may return items under different keys — try common ones
  const items: any[] = data?.items || data?.departments || data?.medications || data?.labTests || data?.services || data?.facilities || [];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectItem = (item: any) => {
    const v: EntitySelectValue = {
      id: getId(item),
      label: getLabel(item),
      code: getCode?.(item) || null,
      _raw: item,
    };
    onChange(v);
    setQuery("");
    setShowResults(false);
    setManualMode(false);
  };

  const clearValue = () => {
    onChange(null);
    setQuery("");
    setManualMode(false);
    setShowResults(true);
  };

  const switchToManual = () => {
    setManualMode(true);
    setShowResults(false);
    onChange({ id: null, label: query });
  };

  // ---- Render: value already selected (chip) ----
  if (hasValue || isManualEntry) {
    return (
      <div className={`relative ${className}`}>
        {label && <FieldLabel required={required}>{label}</FieldLabel>}
        <div className={`flex items-center gap-2 p-2 border rounded-lg ${isManualEntry ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
          <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${isManualEntry ? "text-amber-600" : "text-emerald-600"}`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 truncate">{value?.label}</div>
            {(value?.code || isManualEntry) && (
              <div className="text-xs text-slate-500 truncate">
                {isManualEntry ? (
                  <span className="text-amber-700">Manual entry — not from catalog</span>
                ) : (
                  value?.code && <span className="font-mono">{value.code}</span>
                )}
              </div>
            )}
          </div>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={clearValue} className="h-7 px-2">
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
          value={manualMode ? (value?.label || "") : query}
          onChange={(e) => {
            if (manualMode) {
              onChange({ id: null, label: e.target.value });
            } else {
              setQuery(e.target.value);
              setShowResults(true);
            }
          }}
          onFocus={() => !manualMode && setShowResults(true)}
          disabled={disabled}
          className="pl-8 pr-8"
        />
        <ChevronDown className="w-4 h-4 absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
      </div>

      {showResults && !manualMode && debouncedQuery.length >= 1 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl">
          {isLoading || isFetching ? (
            <div className="p-3 text-xs text-slate-500 text-center">Searching...</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 text-center space-y-2">
              <p>No matches found for &quot;{debouncedQuery}&quot;.</p>
              {allowManual && (
                <button type="button" onClick={switchToManual} className="text-slate-600 hover:underline font-medium">
                  Enter manually instead →
                </button>
              )}
            </div>
          ) : (
            <>
              {items.slice(0, 30).map((item) => {
                const id = getId(item);
                const itemLabel = getLabel(item);
                const subtitle = getSubtitle?.(item) || null;
                const code = getCode?.(item) || null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectItem(item)}
                    className="w-full text-left p-2.5 hover:bg-emerald-50 border-b border-slate-100 last:border-0 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 truncate">{itemLabel}</div>
                        {subtitle && <div className="text-xs text-slate-500 truncate">{subtitle}</div>}
                      </div>
                      {code && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex-shrink-0">
                          {code}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              {allowManual && (
                <button
                  type="button"
                  onClick={switchToManual}
                  className="w-full text-left p-2 hover:bg-amber-50 text-xs text-amber-700 border-t border-slate-200 font-medium"
                >
                  Not found? Enter manually →
                </button>
              )}
            </>
          )}
        </div>
      )}

      {manualMode && (
        <p className="mt-1 text-xs text-amber-600">Manual entry — not from catalog.</p>
      )}
    </div>
  );
}

// =====================================================================
// Convenience wrappers for common entity types
// =====================================================================

/** Searchable department dropdown backed by /api/departments */
export function DepartmentSelect(props: Omit<EntitySelectProps, "endpoint" | "getLabel" | "getId" | "getSubtitle" | "getCode" | "queryParam" | "placeholder"> & {
  placeholder?: string;
  facilityId?: string;
}) {
  const { facilityId, ...rest } = props;
  return (
    <EntitySelect
      endpoint="/api/departments"
      queryParam="q"
      queryParams={facilityId ? { facilityId } : {}}
      getLabel={(d) => d.name}
      getId={(d) => d.id}
      getSubtitle={(d) => d.description || (d.facility ? d.facility.name : null)}
      getCode={(d) => d.code}
      placeholder="Search department by name or code..."
      {...rest}
    />
  );
}

/** Searchable medication dropdown backed by /api/medications */
export function MedicationSelect(props: Omit<EntitySelectProps, "endpoint" | "getLabel" | "getId" | "getSubtitle" | "getCode" | "queryParam" | "placeholder">) {
  return (
    <EntitySelect
      endpoint="/api/medications"
      queryParam="q"
      queryParams={{ status: "active" }}
      getLabel={(m) => m.name}
      getId={(m) => m.id}
      getSubtitle={(m) => {
        const parts = [m.form, m.strength, m.genericName].filter(Boolean);
        return parts.length ? parts.join(" · ") : null;
      }}
      getCode={(m) => m.code || null}
      placeholder="Search medication by name..."
      {...props}
    />
  );
}

/** Searchable lab test dropdown backed by /api/lab-tests */
export function LabTestSelect(props: Omit<EntitySelectProps, "endpoint" | "getLabel" | "getId" | "getSubtitle" | "getCode" | "queryParam" | "placeholder">) {
  return (
    <EntitySelect
      endpoint="/api/lab-tests"
      queryParam="q"
      queryParams={{ status: "active" }}
      getLabel={(t) => t.name}
      getId={(t) => t.id}
      getSubtitle={(t) => {
        const parts = [t.category, t.specimen, t.containerType].filter(Boolean);
        return parts.length ? parts.join(" · ") : null;
      }}
      getCode={(t) => t.code || null}
      placeholder="Search lab test by name or code..."
      {...props}
    />
  );
}

/** Searchable service dropdown backed by /api/services */
export function ServiceSelect(props: Omit<EntitySelectProps, "endpoint" | "getLabel" | "getId" | "getSubtitle" | "getCode" | "queryParam" | "placeholder"> & {
  facilityId?: string;
}) {
  const { facilityId, ...rest } = props;
  return (
    <EntitySelect
      endpoint="/api/services"
      queryParam="q"
      queryParams={{ status: "active", ...(facilityId ? { facilityId } : {}) }}
      getLabel={(s) => s.name}
      getId={(s) => s.id}
      getSubtitle={(s) => {
        const parts = [s.category, s.department?.name].filter(Boolean);
        if (s.facilityPrice?.price != null) parts.push(`₵${s.facilityPrice.price}`);
        return parts.length ? parts.join(" · ") : null;
      }}
      getCode={(s) => s.code || null}
      placeholder="Search service by name or code..."
      {...rest}
    />
  );
}

/** Searchable insurance provider dropdown backed by /api/insurance-providers */
export function InsuranceProviderSelect(props: Omit<EntitySelectProps, "endpoint" | "getLabel" | "getId" | "getSubtitle" | "getCode" | "queryParam" | "placeholder"> & {
  providerType?: string; // nhis | private | corporate | managed_care | ...
}) {
  const { providerType, ...rest } = props;
  return (
    <EntitySelect
      endpoint="/api/insurance-providers"
      queryParam="q"
      queryParams={{ status: "active", ...(providerType ? { providerType } : {}) }}
      getLabel={(p) => p.name}
      getId={(p) => p.id}
      getSubtitle={(p) => {
        const parts = [p.code, p.providerType, p.shortName].filter(Boolean);
        return parts.length ? parts.join(" · ") : null;
      }}
      getCode={(p) => p.code || null}
      placeholder="Search insurance provider by name or code..."
      {...rest}
    />
  );
}

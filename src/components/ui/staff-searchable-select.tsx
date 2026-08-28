"use client";
// =====================================================================
// STAFF SEARCHABLE SELECT — reusable searchable dropdown for staff
//   Handles large staff lists with client-side filtering.
//   Fetches staff from /api/staff with optional facilityId filter.
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { useAppStore } from "@/stores/app-store";
import { safeJson } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { items: [] };
  return safeJson(res);
}

interface StaffSearchableSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Optional facility filter — defaults to active facility */
  facilityId?: string;
  /** Optional filter function to exclude certain staff (e.g., exclude already-selected) */
  excludeIds?: string[];
  /** Optional filter by employment status */
  employmentStatus?: string;
}

export function StaffSearchableSelect({
  value,
  onValueChange,
  placeholder = "Search staff by name or number...",
  label,
  required,
  disabled,
  className,
  facilityId,
  excludeIds = [],
  employmentStatus,
}: StaffSearchableSelectProps) {
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const effectiveFacilityId = facilityId !== undefined ? facilityId : activeFacilityId;

  const { data, isLoading } = useQuery({
    queryKey: ["staff-searchable", effectiveFacilityId, employmentStatus],
    queryFn: () => fetchJson(`/api/staff${effectiveFacilityId ? `?facilityId=${effectiveFacilityId}` : ""}${employmentStatus ? `${effectiveFacilityId ? "&" : "?"}status=${employmentStatus}` : ""}`),
  });

  const staffList = (data?.items || []).filter((s: any) => !excludeIds.includes(s.id));

  const options: SearchableOption[] = staffList.map((s: any) => ({
    value: s.id,
    label: `${s.firstName} ${s.lastName}`,
    description: s.profession || s.professionalRole?.replace(/_/g, " ") || undefined,
    secondary: s.staffNumber,
    initials: `${s.firstName?.[0] || ""}${s.lastName?.[0] || ""}`.toUpperCase(),
  }));

  return (
    <SearchableSelect
      options={options}
      value={value}
      onValueChange={onValueChange}
      placeholder={isLoading ? "Loading staff..." : placeholder}
      searchPlaceholder="Type name or staff number..."
      emptyText={isLoading ? "Loading..." : "No staff found."}
      label={label}
      required={required}
      disabled={disabled || isLoading}
      className={className}
    />
  );
}

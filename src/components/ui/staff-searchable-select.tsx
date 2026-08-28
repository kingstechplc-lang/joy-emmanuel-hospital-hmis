"use client";
// =====================================================================
// STAFF SEARCHABLE SELECT — reusable searchable dropdown for staff
//   Handles large staff lists with client-side filtering.
//   Fetches staff from /api/staff (org-scoped, no facility filter by default
//   so staff assigned via StaffFacility join table are also found).
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { safeJson } from "@/components/ui-helpers";

async function fetchStaff(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await safeJson(res).catch(() => ({}));
    throw new Error(e.error || `Failed to load staff: ${res.status}`);
  }
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
  /**
   * Optional facility filter. When provided, fetches only staff at that
   * facility. When NOT provided, fetches ALL org staff (default) so that
   * staff assigned via the StaffFacility join table are also found.
   */
  facilityId?: string;
  /** Optional filter to exclude certain staff (e.g., exclude already-selected) */
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
  // Build query params — do NOT default to activeFacilityId; fetch all org staff
  // so staff with facilityId=null (assigned via StaffFacility) are included.
  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  if (employmentStatus) params.set("status", employmentStatus);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["staff-searchable", facilityId || "all", employmentStatus || "all"],
    queryFn: () => fetchStaff(`/api/staff${qs}`),
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
      placeholder={isLoading ? "Loading staff..." : error ? "Error loading staff" : placeholder}
      searchPlaceholder="Type name or staff number..."
      emptyText={isLoading ? "Loading..." : error ? (error as Error).message : "No staff found. Try a different search."}
      label={label}
      required={required}
      disabled={disabled || isLoading}
      className={className}
    />
  );
}

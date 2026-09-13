"use client";

// =====================================================================
// WidgetConfigDialog — per-widget configuration dialog
// =====================================================================
// Opens when the user clicks the "Configure" button on a widget.
// Supports:
//   maxItems (for list widgets) — number input
//   dateRange (for KPI widgets with date-scoped data) — dropdown:
//     today | 7d | 30d | month | quarter | year
//   facilityScope (for org-wide users) — dropdown: all | current
//
// The dialog is generic — it reads the widget's configSchema from the
// registry and renders the appropriate inputs based on which schema
// keys are present.
// =====================================================================

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { WIDGET_BY_ID, type WidgetPlacement } from "@/lib/dashboard/widget-registry";

const DATE_RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year", label: "This Year" },
] as const;

const FACILITY_SCOPE_OPTIONS = [
  { value: "current", label: "Current Facility" },
  { value: "all", label: "All Facilities" },
] as const;

export function WidgetConfigDialog({
  open,
  onOpenChange,
  placement,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placement: WidgetPlacement | null;
  onSave: (config: WidgetPlacement["config"]) => void;
}) {
  const [maxItems, setMaxItems] = useState<number>(5);
  const [dateRange, setDateRange] = useState<string>("today");
  const [facilityScope, setFacilityScope] = useState<string>("current");

  // Initialize from the placement when opened
  useEffect(() => {
    if (placement) {
      const widget = WIDGET_BY_ID[placement.widgetId];
      const defaultMax = widget?.configSchema?.maxItems?.default || 5;
      setMaxItems(placement.config?.maxItems || defaultMax);
      // dateRange default — use the widget's declared default, else "today"
      const defaultDateRange = widget?.configSchema?.dateRange?.default || "today";
      setDateRange(placement.config?.dateRange || defaultDateRange);
      // facilityScope default — use the widget's declared default, else "current"
      const defaultFacilityScope = widget?.configSchema?.facilityScope?.default || "current";
      setFacilityScope(placement.config?.facilityScope || defaultFacilityScope);
    }
  }, [placement]);

  if (!placement) return null;
  const widget = WIDGET_BY_ID[placement.widgetId];
  if (!widget) return null;

  const hasMaxItems = !!widget.configSchema?.maxItems;
  const maxItemsConfig = widget.configSchema?.maxItems;
  const hasDateRange = !!widget.configSchema?.dateRange;
  const dateRangeConfig = widget.configSchema?.dateRange;
  const hasFacilityScope = !!widget.configSchema?.facilityScope;
  const facilityScopeConfig = widget.configSchema?.facilityScope;

  // Filter the date range options to only those supported by this widget
  const allowedDateRanges = dateRangeConfig?.options || [];
  const visibleDateRangeOptions = hasDateRange
    ? DATE_RANGE_OPTIONS.filter((o) => allowedDateRanges.includes(o.value as any))
    : DATE_RANGE_OPTIONS;

  const hasAnyConfig = hasMaxItems || hasDateRange || hasFacilityScope;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure: {widget.name}</DialogTitle>
          <DialogDescription>{widget.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* maxItems */}
          {hasMaxItems && maxItemsConfig && (
            <div className="space-y-1.5">
              <Label htmlFor="maxItems">Maximum items to display</Label>
              <Input
                id="maxItems"
                type="number"
                min={maxItemsConfig.min}
                max={maxItemsConfig.max}
                value={maxItems}
                onChange={(e) => setMaxItems(Number(e.target.value))}
              />
              <p className="text-xs text-slate-500">
                Between {maxItemsConfig.min} and {maxItemsConfig.max}. Default: {maxItemsConfig.default}.
              </p>
            </div>
          )}

          {/* dateRange */}
          {hasDateRange && (
            <div className="space-y-1.5">
              <Label htmlFor="dateRange">Date Range</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger id="dateRange">
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  {visibleDateRangeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Controls the time period this KPI covers. Default: {dateRangeConfig?.default}.
              </p>
            </div>
          )}

          {/* facilityScope */}
          {hasFacilityScope && (
            <div className="space-y-1.5">
              <Label htmlFor="facilityScope">Facility Scope</Label>
              <Select value={facilityScope} onValueChange={setFacilityScope}>
                <SelectTrigger id="facilityScope">
                  <SelectValue placeholder="Select facility scope" />
                </SelectTrigger>
                <SelectContent>
                  {FACILITY_SCOPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Whether this KPI aggregates across all facilities or just the current one.
                Default: {facilityScopeConfig?.default === "all" ? "All Facilities" : "Current Facility"}.
              </p>
            </div>
          )}

          {!hasAnyConfig && (
            <p className="text-sm text-slate-500 text-center py-4">
              This widget has no configuration options.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const newConfig: WidgetPlacement["config"] = { ...placement.config };
              if (hasMaxItems) {
                newConfig.maxItems = Math.max(
                  maxItemsConfig!.min,
                  Math.min(maxItemsConfig!.max, maxItems)
                );
              }
              if (hasDateRange) {
                newConfig.dateRange = dateRange as any;
              }
              if (hasFacilityScope) {
                newConfig.facilityScope = facilityScope as any;
              }
              onSave(newConfig);
              onOpenChange(false);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

// =====================================================================
// AddWidgetDialog — picker for adding a new widget to the dashboard
// =====================================================================
// Fetches the list of widgets available to the current user from
// GET /api/dashboard/widgets, displays them grouped by category, and
// lets the user pick one to add to their layout.
//
// Props:
//   open / onOpenChange — dialog open state
//   onAddWidget(widgetId) — called when the user picks a widget
//   existingWidgetIds — ids already on the dashboard (to show "Added"
//                        badge on already-placed widgets)
// =====================================================================

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Plus, Check } from "lucide-react";
import { safeJson } from "@/components/ui-helpers";
import { WIDGET_CATEGORIES } from "@/lib/dashboard/widget-registry";

async function fetchWidgets() {
  const res = await fetch("/api/dashboard/widgets");
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function AddWidgetDialog({
  open,
  onOpenChange,
  onAddWidget,
  existingWidgetIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddWidget: (widgetId: string) => void;
  existingWidgetIds: string[];
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-widgets"],
    queryFn: fetchWidgets,
    enabled: open,
    staleTime: 60_000, // cache for 1 minute
  });

  const widgets = data?.widgets || [];
  const filtered = useMemo(() => {
    if (!search.trim()) return widgets;
    const q = search.toLowerCase();
    return widgets.filter(
      (w: any) =>
        w.name.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q) ||
        w.id.toLowerCase().includes(q) ||
        w.category.toLowerCase().includes(q)
    );
  }, [widgets, search]);

  // Group by category in display order
  const byCategory = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const cat of WIDGET_CATEGORIES) map[cat] = [];
    for (const w of filtered) {
      if (!map[w.category]) map[w.category] = [];
      map[w.category].push(w);
    }
    return map;
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-600" />
            Add Widget
          </DialogTitle>
          <DialogDescription>
            Choose a widget to add to your dashboard. Only widgets you have permission to use are shown.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search widgets by name, description, or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {isLoading && <p className="text-sm text-slate-500 text-center py-8">Loading widgets…</p>}
          {isError && <p className="text-sm text-rose-600 text-center py-8">Failed to load widgets.</p>}
          {!isLoading && !isError && filtered.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">
              No widgets match your search.
            </p>
          )}
          {!isLoading && !isError && filtered.length > 0 && (
            Object.entries(byCategory).map(([cat, ws]) =>
              ws.length === 0 ? null : (
                <div key={cat}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    {cat}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {ws.map((w: any) => {
                      const isAdded = existingWidgetIds.includes(w.id);
                      return (
                        <button
                          key={w.id}
                          onClick={() => {
                            if (!isAdded) {
                              onAddWidget(w.id);
                              onOpenChange(false);
                            }
                          }}
                          disabled={isAdded}
                          className={`text-left p-3 rounded-lg border transition group ${
                            isAdded
                              ? "border-slate-200 bg-slate-50 cursor-default opacity-70"
                              : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm font-semibold text-slate-900">{w.name}</p>
                            {isAdded ? (
                              <Badge variant="secondary" className="text-[10px]">
                                <Check className="w-3 h-3 mr-0.5" /> Added
                              </Badge>
                            ) : (
                              <Plus className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition" />
                            )}
                          </div>
                          <p className="text-xs text-slate-500 leading-snug">{w.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            )
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

// =====================================================================
// WidgetWardOccupancy — "Ward Occupancy" bars widget
// =====================================================================
// Renders per-ward bed utilization as horizontal progress bars.
// Each bar shows ward name, occupied/total count, and a colored bar.
//
// Config schema:
//   maxItems (default 6) — maximum number of wards to show
// =====================================================================

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, BedDouble } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { EmptyState, LoadingState } from "@/components/ui-helpers";

export function WidgetWardOccupancy({
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
  const max = config.maxItems || 6;
  const wards = (stats?.wardOccupancy || []).slice(0, max);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <BedDouble className="w-4 h-4 text-indigo-600" /> Ward Occupancy
          </CardTitle>
          <CardDescription>Current bed utilization</CardDescription>
        </div>
        <div className="flex items-center gap-1">
          {onConfigure && (
            <Button variant="ghost" size="sm" onClick={onConfigure} className="h-7 px-2 text-xs">
              Configure
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setView("beds")} className="h-7 px-2 gap-1 text-xs">
            View all <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {isLoading ? (
          <LoadingState rows={4} />
        ) : wards.length === 0 ? (
          <EmptyState title="No ward data" description="Ward occupancy will appear here once beds are configured." icon={BedDouble} />
        ) : (
          <div className="space-y-3">
            {wards.map((w: any) => (
              <div key={w.code}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700">{w.name}</span>
                  <span className="text-slate-500">
                    {w.occupied}/{w.total}
                  </span>
                </div>
                <Progress
                  value={w.total > 0 ? (w.occupied / w.total) * 100 : 0}
                  className="h-2"
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

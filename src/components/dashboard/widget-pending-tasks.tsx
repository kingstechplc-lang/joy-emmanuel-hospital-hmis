"use client";

// =====================================================================
// WidgetPendingTasks — "My Pending Tasks" list widget
// =====================================================================
// Renders tasks assigned to the current user, sorted by due date.
// Each row shows priority badge, title, and due date.
//
// Config schema:
//   maxItems (default 5) — maximum number of tasks to show
// =====================================================================

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { EmptyState, LoadingState } from "@/components/ui-helpers";

export function WidgetPendingTasks({
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
  const max = config.maxItems || 5;
  const tasks = (stats?.pendingTasks || []).slice(0, max);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> My Pending Tasks
          </CardTitle>
          <CardDescription>Tasks assigned to you</CardDescription>
        </div>
        <div className="flex items-center gap-1">
          {onConfigure && (
            <Button variant="ghost" size="sm" onClick={onConfigure} className="h-7 px-2 text-xs">
              Configure
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setView("tasks")} className="h-7 px-2 gap-1 text-xs">
            View all <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {isLoading ? (
          <LoadingState rows={3} />
        ) : tasks.length === 0 ? (
          <EmptyState title="You're all caught up" description="No pending tasks assigned to you." icon={Clock} />
        ) : (
          <div className="space-y-2">
            {tasks.map((t: any) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-2 rounded border border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      t.priority === "urgent"
                        ? "destructive"
                        : t.priority === "high"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {t.priority}
                  </Badge>
                  <span className="text-sm font-medium text-slate-800">{t.title}</span>
                </div>
                {t.dueAt && (
                  <span className="text-xs text-slate-500">
                    Due: {new Date(t.dueAt).toLocaleString("en-GB")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

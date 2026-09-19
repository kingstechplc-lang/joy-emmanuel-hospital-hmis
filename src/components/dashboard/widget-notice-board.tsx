"use client";

// =====================================================================
// WidgetNoticeBoard — dashboard widget showing latest active notices
// =====================================================================
// Compact card for the dashboard grid. Shows:
//   - Latest 3 active notices (priority-coloured)
//   - Counts: total active, unread, critical, pending ack
//   - "View All Notices →" link to the full Notice Board
//
// Polls /api/notices?pageSize=3 + /api/notices/counts every 15s,
// pauses when tab hidden (refetchIntervalInBackground=false).
// =====================================================================
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Megaphone, ShieldAlert, AlertTriangle, CheckCircle2, Eye, Pin, ChevronRight, Loader2,
} from "lucide-react";
import { safeJson } from "@/components/ui-helpers";
import { useAppStore } from "@/stores/app-store";
import { isOnline } from "@/lib/offline";
import { useState, useEffect } from "react";

const TYPE_ICONS: Record<string, string> = {
  GENERAL: "Info", IMPORTANT: "Megaphone", URGENT: "AlertTriangle", EMERGENCY: "ShieldAlert",
  MAINTENANCE: "Wrench", CLINICAL: "Stethoscope", ADMINISTRATIVE: "FileText", IT: "Cpu",
  SECURITY: "Lock", STAFF: "Users", EVENT: "Calendar", POLICY: "ShieldAlert",
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "border-rose-300 bg-rose-50",
  HIGH: "border-orange-200 bg-orange-50",
  NORMAL: "border-slate-200 bg-white",
  LOW: "border-slate-100 bg-slate-50",
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-rose-500", HIGH: "bg-orange-500", NORMAL: "bg-violet-500", LOW: "bg-slate-400",
};

async function fetchJson(url: string) {
  const res = await fetch(url);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error || `Failed: ${res.status}`);
  return json;
}

export function WidgetNoticeBoard({ onNavigate }: { onNavigate?: (key: string) => void }) {
  const setView = useAppStore((s) => s.setView);
  const [online, setOnline] = useState(isOnline());

  useEffect(() => {
    const handler = () => setOnline(isOnline());
    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);
    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("offline", handler);
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["widget-notice-board"],
    queryFn: async () => {
      const [items, counts] = await Promise.all([
        fetchJson("/api/notices?pageSize=3"),
        fetchJson("/api/notices/counts"),
      ]);
      return { items: items.items || [], counts };
    },
    refetchInterval: online ? 15_000 : false,
    refetchIntervalInBackground: false,
  });

  const items = data?.items || [];
  const counts = data?.counts || { totalActive: 0, unread: 0, critical: 0, pendingAck: 0 };

  const openBoard = () => {
    if (onNavigate) onNavigate("notice_board");
    else if (setView) setView("notice_board");
  };

  return (
    <Card className="overflow-hidden border-violet-200 shadow-sm">
      {/* Gradient top strip */}
      <div className="h-1 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500" />
      <CardContent className="p-3 sm:p-4 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-violet-500 to-purple-700 text-white flex items-center justify-center">
              <Megaphone className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Live Notice Board</span>
          </div>
          <div className="flex items-center gap-1">
            {counts.critical > 0 && (
              <Badge variant="outline" className="text-[9px] py-0 bg-rose-50 text-rose-700 border-rose-200">
                <ShieldAlert className="w-2.5 h-2.5 mr-0.5" /> {counts.critical}
              </Badge>
            )}
            {counts.unread > 0 && (
              <Badge variant="outline" className="text-[9px] py-0 bg-amber-50 text-amber-700 border-amber-200">
                <Eye className="w-2.5 h-2.5 mr-0.5" /> {counts.unread}
              </Badge>
            )}
            {counts.pendingAck > 0 && (
              <Badge variant="outline" className="text-[9px] py-0 bg-orange-50 text-orange-700 border-orange-200">
                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> {counts.pendingAck}
              </Badge>
            )}
          </div>
        </div>

        {/* Items */}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400">
            No active notices.
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((n: any) => {
              const pColor = PRIORITY_COLORS[n.priority] || PRIORITY_COLORS.NORMAL;
              const pDot = PRIORITY_DOT[n.priority] || PRIORITY_DOT.NORMAL;
              return (
                <div
                  key={n.id}
                  className={`rounded-md p-2 border ${pColor} cursor-pointer transition-colors hover:shadow-sm`}
                  onClick={openBoard}
                >
                  <div className="flex items-start gap-1.5">
                    <span className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${pDot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 mb-0.5">
                        {n.isPinned && <Pin className="w-2.5 h-2.5 text-amber-600 shrink-0" />}
                        <span className="text-xs font-semibold text-slate-900 truncate">{n.title}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {n.facility?.name || "Org-wide"} · {n.department?.name || "All depts"}
                      </div>
                    </div>
                    {!n.isRead && (
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-violet-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-[11px] text-violet-700 hover:bg-violet-50 hover:text-violet-800"
          onClick={openBoard}
        >
          View All Notices <ChevronRight className="w-3 h-3" />
        </Button>
      </CardContent>
    </Card>
  );
}

"use client";

// =====================================================================
// DashboardCustomizer — the drag-and-drop dashboard grid
// =====================================================================
// Renders the user's saved (or default) dashboard layout as a grid of
// widgets. In edit mode, widgets can be:
//   - Dragged to reorder (using @dnd-kit/sortable)
//   - Resized via a size selector (sm/md/lg/xl)
//   - Configured via the WidgetConfigDialog
//   - Removed via an X button
// In view mode, widgets are static (no drag handles, no edit controls).
//
// Layout changes are saved to the backend via PUT /api/dashboard/layout
// whenever the user makes a change in edit mode. The save is debounced
// (500ms) so rapid drag operations don't flood the API.
//
// Props:
//   layout / setLayout — the current layout state (lifted to parent)
//   stats              — the /api/dashboard/stats response
//   statsLoading       — whether stats are loading
//   editMode           — whether we're in edit mode
//   canCustomize       — whether the user has dashboard.customize perm
//   onToggleEdit       — callback to toggle edit mode
//   onResetLayout      — callback to reset to default
//   onSaveLayout       — callback to persist the layout to the backend
//   saveState          — "idle" | "saving" | "saved" | "error"
// =====================================================================

import { useState, useEffect, useCallback } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy,
  useSortable, arrayMove, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Settings2, X, GripVertical, RefreshCcw, Loader2, Check,
  AlertCircle, Plus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { WidgetRenderer } from "./widget-renderer";
import { WidgetConfigDialog } from "./widget-config-dialog";
import { AddWidgetDialog } from "./add-widget-dialog";
import {
  WIDGET_BY_ID, type WidgetPlacement,
} from "@/lib/dashboard/widget-registry";

// ─── SortableWidget — a single draggable widget wrapper ──────────────

function SortableWidget({
  placement,
  stats,
  isLoading,
  editMode,
  onRemove,
  onConfigure,
}: {
  placement: WidgetPlacement;
  stats: any;
  isLoading: boolean;
  editMode: boolean;
  onRemove: () => void;
  onConfigure: () => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: placement.widgetId, disabled: !editMode });

  const style: any = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    // Convert grid coordinates to CSS grid placement (12-col grid)
    gridColumn: `${placement.x + 1} / span ${placement.w}`,
    gridRow: `${placement.y + 1} / span ${placement.h}`,
  };

  const widget = WIDGET_BY_ID[placement.widgetId];

  return (
    <div ref={setNodeRef} style={style} className={`dashboard-widget-cell relative ${editMode ? "ring-2 ring-emerald-300/50 rounded-2xl" : ""}`}>
      {/* Edit-mode toolbar — positioned INSIDE the widget top-right corner
          to avoid clipping at the grid edge and overlap with the row above */}
      {editMode && (
        <div className="absolute top-1 right-1 z-30 flex items-center gap-0.5 bg-white/95 backdrop-blur-sm rounded-md shadow-md border border-slate-200 px-1 py-0.5">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="p-1 text-slate-500 hover:text-emerald-600 cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          {/* Configure button (only if widget has a config schema) */}
          {widget?.configSchema && (
            <button
              onClick={onConfigure}
              className="p-1 text-slate-500 hover:text-blue-600"
              title="Configure widget"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
          {/* Remove button */}
          <button
            onClick={onRemove}
            className="p-1 text-slate-500 hover:text-rose-600"
            title="Remove widget"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="h-full">
        <WidgetRenderer
          widgetId={placement.widgetId}
          stats={stats}
          isLoading={isLoading}
          config={placement.config}
          editMode={editMode}
          onConfigure={editMode ? onConfigure : undefined}
        />
      </div>
    </div>
  );
}

// ─── DashboardCustomizer — main grid component ───────────────────────

export function DashboardCustomizer({
  layout,
  setLayout,
  stats,
  statsLoading,
  editMode,
  canCustomize,
  onToggleEdit,
  onResetLayout,
  onSaveLayout,
  saveState,
}: {
  layout: WidgetPlacement[];
  setLayout: (layout: WidgetPlacement[]) => void;
  stats: any;
  statsLoading: boolean;
  editMode: boolean;
  canCustomize: boolean;
  onToggleEdit: () => void;
  onResetLayout: () => void;
  onSaveLayout: () => void;
  saveState: "idle" | "saving" | "saved" | "error";
}) {
  const [configPlacement, setConfigPlacement] = useState<WidgetPlacement | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ── Drag end handler — reorder the layout ────────────────────────
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setLayout(
        arrayMove(
          layout,
          layout.findIndex((p) => p.widgetId === active.id),
          layout.findIndex((p) => p.widgetId === over.id)
        )
      );
    },
    [layout, setLayout]
  );

  // ── When a widget is re-ordered via drag, we need to re-flow the
  // grid coordinates (x, y) so the layout stays packed. The simplest
  // approach: after every drag, re-arrange widgets in their new order
  // using the same algorithm as arrangeWidgets(). But for visual
  // smoothness during the drag, we keep the original x/y until the
  // user releases the mouse. After release, we re-flow.
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editMode) return;
    // Re-flow coordinates based on the current order, packing widgets
    // by their defaultSize (KPIs are w=3 = 4 per row; list/panel widgets
    // get their own rows). This keeps the grid visually clean after a drag.
    let x = 0;
    let y = 0;
    const reflowed = layout.map((p) => {
      const widget = WIDGET_BY_ID[p.widgetId];
      const w = widget?.defaultSize.w || 3;
      const h = widget?.defaultSize.h || 1;
      if (x + w > 12) {
        x = 0;
        y += 1;
      }
      const placement = { ...p, x, y, w, h };
      x += w;
      if (x >= 12) {
        x = 0;
        y += 1;
      }
      return placement;
    });
    // Only update if coordinates actually changed (avoid loops)
    const changed = reflowed.some((p, i) =>
      p.x !== layout[i]?.x || p.y !== layout[i]?.y || p.w !== layout[i]?.w || p.h !== layout[i]?.h
    );
    if (changed) {
      setLayout(reflowed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, layout.map((p) => p.widgetId).join(",")]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleRemove = (widgetId: string) => {
    setLayout(layout.filter((p) => p.widgetId !== widgetId));
  };

  const handleConfigure = (placement: WidgetPlacement) => {
    setConfigPlacement(placement);
    setConfigOpen(true);
  };

  const handleSaveConfig = (config: WidgetPlacement["config"]) => {
    if (!configPlacement) return;
    setLayout(
      layout.map((p) =>
        p.widgetId === configPlacement.widgetId ? { ...p, config } : p
      )
    );
    setConfigPlacement(null);
  };

  const handleAddWidget = (widgetId: string) => {
    const widget = WIDGET_BY_ID[widgetId];
    if (!widget) return;
    // Add to the end of the layout, auto-flowing coordinates
    let x = 0;
    let y = 0;
    if (layout.length > 0) {
      // Place after the last widget
      const last = layout[layout.length - 1];
      x = last.x + last.w;
      y = last.y;
      if (x + widget.defaultSize.w > 12) {
        x = 0;
        y = last.y + last.h;
      }
    }
    setLayout([
      ...layout,
      {
        widgetId,
        x,
        y,
        w: widget.defaultSize.w,
        h: widget.defaultSize.h,
        config: {},
      },
    ]);
  };

  // ─── Render ────────────────────────────────────────────────────────
  if (layout.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-sm font-semibold text-slate-900 mb-1">
            Your dashboard has no widgets
          </p>
          <p className="text-xs text-slate-500 mb-4">
            Add widgets to start building your custom dashboard.
          </p>
          {canCustomize && (
            <Button onClick={() => setAddWidgetOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Add Widget
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Edit mode toolbar */}
      {canCustomize && (
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              onClick={onToggleEdit}
              variant={editMode ? "default" : "outline"}
              size="sm"
              className={editMode ? "bg-emerald-600 hover:bg-emerald-700 text-white gap-2" : "gap-2"}
            >
              {editMode ? (
                <>
                  <Check className="w-4 h-4" /> Done Editing
                </>
              ) : (
                <>
                  <Settings2 className="w-4 h-4" /> Customize Dashboard
                </>
              )}
            </Button>
            {editMode && (
              <>
                <Button
                  onClick={() => setAddWidgetOpen(true)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" /> Add Widget
                </Button>
                <Button
                  onClick={onResetLayout}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <RefreshCcw className="w-4 h-4" /> Reset to Default
                </Button>
              </>
            )}
          </div>
          {editMode && (
            <div className="flex items-center gap-2">
              {/* Save state indicator */}
              {saveState === "saving" && (
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                </Badge>
              )}
              {saveState === "saved" && (
                <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-200 bg-emerald-50">
                  <Check className="w-3 h-3" /> Saved
                </Badge>
              )}
              {saveState === "error" && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="w-3 h-3" /> Save failed
                </Badge>
              )}
            </div>
          )}
        </div>
      )}

      {/* Grid — uses CSS Grid with 12 columns and dynamic row spans.
          In edit mode, the grid is wrapped in a DndContext + SortableContext.
          gridAutoRows is "auto" so rows size to their tallest widget's
          natural content height — KPI rows are short, list rows are tall.
          On mobile (<768px), the .dashboard-widget-cell CSS class in
          globals.css overrides gridColumn/gridRow to stack all widgets
          full-width. */}
      {editMode ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={layout.map((p) => p.widgetId)}
            strategy={rectSortingStrategy}
          >
            <div
              className="grid gap-3 md:gap-4"
              style={{
                gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
                gridAutoRows: "auto",
              }}
            >
              {layout.map((placement) => (
                <SortableWidget
                  key={placement.widgetId}
                  placement={placement}
                  stats={stats}
                  isLoading={statsLoading}
                  editMode={editMode}
                  onRemove={() => handleRemove(placement.widgetId)}
                  onConfigure={() => handleConfigure(placement)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        // View mode — static grid (no DnD)
        <div
          className="grid gap-3 md:gap-4"
          style={{
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            gridAutoRows: "auto",
          }}
        >
          {layout.map((placement) => (
            <div
              key={placement.widgetId}
              className="dashboard-widget-cell"
              style={{
                gridColumn: `${placement.x + 1} / span ${placement.w}`,
                gridRow: `${placement.y + 1} / span ${placement.h}`,
              }}
            >
              <WidgetRenderer
                widgetId={placement.widgetId}
                stats={stats}
                isLoading={statsLoading}
                config={placement.config}
              />
            </div>
          ))}
        </div>
      )}

      {/* Config dialog */}
      <WidgetConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        placement={configPlacement}
        onSave={handleSaveConfig}
      />

      {/* Add widget dialog */}
      <AddWidgetDialog
        open={addWidgetOpen}
        onOpenChange={setAddWidgetOpen}
        onAddWidget={handleAddWidget}
        existingWidgetIds={layout.map((p) => p.widgetId)}
      />
    </>
  );
}

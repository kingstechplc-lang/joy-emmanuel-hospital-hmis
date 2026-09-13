"use client";

// =====================================================================
// WidgetConfigDialog — per-widget configuration dialog
// =====================================================================
// Opens when the user clicks the "Configure" button on a widget.
// Supports:
//   maxItems (for list widgets) — number input
//
// The dialog is generic — it reads the widget's configSchema from the
// registry and renders the appropriate inputs. For now, only maxItems
// is supported; dateRange and facilityScope will be added in Phase 5
// (drill-down + KPI optimization).
// =====================================================================

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WIDGET_BY_ID, type WidgetPlacement } from "@/lib/dashboard/widget-registry";

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

  // Initialize from the placement when opened
  useEffect(() => {
    if (placement) {
      const widget = WIDGET_BY_ID[placement.widgetId];
      const defaultMax = widget?.configSchema?.maxItems?.default || 5;
      setMaxItems(placement.config?.maxItems || defaultMax);
    }
  }, [placement]);

  if (!placement) return null;
  const widget = WIDGET_BY_ID[placement.widgetId];
  if (!widget) return null;

  const hasMaxItems = !!widget.configSchema?.maxItems;
  const maxItemsConfig = widget.configSchema?.maxItems;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure: {widget.name}</DialogTitle>
          <DialogDescription>{widget.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
          {!hasMaxItems && (
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

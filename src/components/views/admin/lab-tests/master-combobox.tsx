"use client";
// =====================================================================
// MasterCombobox — dropdown backed by a master API endpoint, with the
// ability to type a custom value if the option isn't listed yet.
//
// Used for: Specimen Type, Unit, Category (and any other free-text field
// that should pull from configurable masters but still allow ad-hoc entry).
//
// Props:
//   endpoint — GET endpoint returning { items: [{ id, name, code, ... }] }
//   value    — current string value
//   onChange — callback with the selected string
//   placeholder, label, etc.
// =====================================================================
import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface MasterComboboxProps {
  endpoint: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  label?: string;
  required?: boolean;
  helperText?: string;
  className?: string;
  disabled?: boolean;
  /** Render the field name (used in the "create new" hint) */
  fieldLabel?: string;
}

export function MasterCombobox({
  endpoint,
  value,
  onChange,
  placeholder = "Select or type…",
  searchPlaceholder = "Search…",
  emptyText = "No options found.",
  label,
  required,
  helperText,
  className,
  disabled,
  fieldLabel = "option",
}: MasterComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [items, setItems] = React.useState<any[]>([]);

  // Load options when popover opens (or when endpoint changes)
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(endpoint);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.items)) setItems(data.items);
      } catch {
        // silent
      }
    })();
    return () => { cancelled = true; };
  }, [endpoint, open]);

  // Filtered options based on search
  const filtered = React.useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((i) =>
      (i.name || "").toLowerCase().includes(q) ||
      (i.code || "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const isCustom = value && !items.some((i) => i.name === value);

  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              !value && "text-slate-400",
              isCustom && "text-emerald-700 border-emerald-300 bg-emerald-50",
            )}
          >
            <span className="truncate text-left">
              {value || placeholder}
              {isCustom && <span className="ml-2 text-[10px] uppercase tracking-wide">custom</span>}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              {filtered.length > 0 && (
                <CommandGroup heading={fieldLabel ? `${fieldLabel}s from master` : "Options"}>
                  {filtered.map((item: any) => (
                    <CommandItem
                      key={item.id}
                      value={item.name}
                      onSelect={() => {
                        onChange(item.name);
                        setOpen(false);
                        setSearch("");
                      }}
                      className="gap-2"
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5",
                          value === item.name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex-1 truncate">{item.name}</span>
                      {item.code && (
                        <span className="text-[10px] text-slate-400 font-mono">{item.code}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup heading="Custom value">
                <CommandItem
                  onSelect={() => {
                    if (search.trim()) {
                      onChange(search.trim());
                      setOpen(false);
                      setSearch("");
                    }
                  }}
                  className="gap-2 text-emerald-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Use "<strong className="font-medium">{search || "typed value"}</strong>" as {fieldLabel}</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
}

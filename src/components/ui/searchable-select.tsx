"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FieldLabel } from "@/components/ui/required-label";

export interface SearchableOption {
  value: string;
  label: string;
  description?: string;
  /** Optional secondary text shown to the right (e.g., patient number, role) */
  secondary?: string;
  /** Optional avatar/initials to show */
  initials?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Show the label above the select */
  label?: string;
  required?: boolean;
  /** Helper text shown below */
  helperText?: string;
  className?: string;
  disabled?: boolean;
  /** Render a custom trigger button (default uses the standard styled one) */
  triggerClassName?: string;
  /**
   * Optional async search callback. When provided, the component will call
   * this function on every search input change (debounced 250ms) and use
   * the result to populate options. Use this for server-side searches.
   */
  onSearch?: (query: string) => void | Promise<void>;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  label,
  required,
  helperText,
  className,
  disabled,
  triggerClassName,
  onSearch,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced async search
  const handleSearchChange = React.useCallback(
    (val: string) => {
      setSearch(val);
      if (!onSearch) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearch(val);
      }, 250);
    },
    [onSearch]
  );

  // Cleanup debounce on unmount
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const selected = options.find((o) => o.value === value);

  // Filter options by search query (case-insensitive on label + description + secondary)
  // Skip client-side filtering if onSearch is provided (server handles it)
  const filtered = React.useMemo(() => {
    if (onSearch) return options;
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q) ||
        o.secondary?.toLowerCase().includes(q)
    );
  }, [options, search, onSearch]);

  const handleSelect = (val: string) => {
    onValueChange(val);
    setSearch("");
    setOpen(false);
  };

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <FieldLabel required={required} className="mb-1.5">
          {label}
        </FieldLabel>
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
              "w-full justify-between font-normal h-10",
              !selected && "text-slate-400",
              triggerClassName
            )}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              {selected?.initials && (
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold flex items-center justify-center shrink-0">
                  {selected.initials}
                </span>
              )}
              <span className="truncate">{selected ? selected.label : placeholder}</span>
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {selected && (
                <X
                  className="w-3.5 h-3.5 text-slate-400 hover:text-rose-500 transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect("");
                  }}
                />
              )}
              <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0" align="start">
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3">
              <Search className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
              <CommandInput
                placeholder={searchPlaceholder}
                value={search}
                onValueChange={handleSearchChange}
                className="border-0 ring-0 focus:ring-0 h-9"
              />
            </div>
            <CommandList className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <CommandEmpty>{emptyText}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {filtered.map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      onSelect={() => handleSelect(opt.value)}
                      className="py-2"
                    >
                      <div className="flex items-center gap-2 w-full min-w-0">
                        {opt.initials && (
                          <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold flex items-center justify-center shrink-0">
                            {opt.initials}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{opt.label}</div>
                          {opt.description && (
                            <div className="text-xs text-slate-500 truncate">{opt.description}</div>
                          )}
                        </div>
                        {opt.secondary && (
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            {opt.secondary}
                          </span>
                        )}
                        <Check
                          className={cn(
                            "w-4 h-4 shrink-0 ml-1",
                            value === opt.value ? "text-emerald-600 opacity-100" : "opacity-0"
                          )}
                        />
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {helperText && <p className="text-xs text-slate-500 mt-1">{helperText}</p>}
    </div>
  );
}

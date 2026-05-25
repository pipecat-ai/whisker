//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  placeholder: string;
  availableItems: string[];
  selectedItems: Set<string>;
  onToggle: (item: string) => void;
  onClear: () => void;
  formatLabel?: (item: string) => string;
};

export function SearchableFilterDropdown({
  label,
  placeholder,
  availableItems,
  selectedItems,
  onToggle,
  onClear,
  formatLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const fmt = formatLabel || ((s: string) => s);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return availableItems.filter((t) => t.toLowerCase().includes(q));
  }, [availableItems, search]);

  const someUnselected =
    filtered.length > 0 && !filtered.every((t) => selectedItems.has(t));
  const showSelectAll = someUnselected;
  const showClear = selectedItems.size > 0;

  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-md border bg-background hover:bg-accent/30"
      >
        {selectedItems.size > 0 ? `${selectedItems.size} selected` : label}
        <Chevron size={10} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-64 rounded-md border bg-popover shadow-lg">
          {(showSelectAll || showClear) && (
            <div className="flex gap-2 p-2 border-b">
              {showSelectAll && (
                <button
                  onClick={() => {
                    for (const t of filtered) {
                      if (!selectedItems.has(t)) onToggle(t);
                    }
                  }}
                  className="flex-1 px-2 py-1 text-xs rounded-md bg-background hover:bg-accent/40"
                >
                  Select all
                </button>
              )}
              {showClear && (
                <button
                  onClick={onClear}
                  className="flex-1 px-2 py-1 text-xs rounded-md bg-background hover:bg-accent/40"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          <div className="p-2 border-b">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={placeholder}
              className="w-full px-2 py-1 text-xs rounded-md border bg-background outline-none"
              autoFocus
            />
          </div>
          <div className="max-h-[240px] overflow-auto">
            {filtered.length === 0 ? (
              <div className="p-2 text-xs text-center text-muted-foreground">
                No results
              </div>
            ) : (
              filtered.map((item) => {
                const checked = selectedItems.has(item);
                return (
                  <button
                    key={item}
                    onClick={() => onToggle(item)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent/30"
                  >
                    <span
                      className={cn(
                        "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                        checked
                          ? "border-primary bg-primary"
                          : "border-input"
                      )}
                    >
                      {checked && (
                        <span className="text-[9px] text-primary-foreground">
                          ✓
                        </span>
                      )}
                    </span>
                    <span className="truncate">{fmt(item)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

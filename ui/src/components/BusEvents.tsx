//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useStore } from "../state.store";
import { BusEventCategory } from "../types";
import { BusEventItem, stripBusPrefix } from "./BusEventItem";
import { SearchableFilterDropdown } from "./SearchableFilterDropdown";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const ALL_CATEGORIES: BusEventCategory[] = [
  "lifecycle",
  "frame",
  "job",
  "other",
];

const CATEGORY_PILL_STYLES: Record<
  BusEventCategory,
  { bg: string; fg: string }
> = {
  lifecycle: { bg: "hsla(220, 80%, 55%, 0.15)", fg: "hsl(220, 80%, 55%)" },
  frame: { bg: "hsla(280, 60%, 55%, 0.15)", fg: "hsl(280, 60%, 55%)" },
  job: { bg: "hsla(35, 80%, 50%, 0.15)", fg: "hsl(35, 80%, 50%)" },
  other: { bg: "hsla(0, 0%, 50%, 0.1)", fg: "hsl(0, 0%, 50%)" },
};

function CategoryToggle({
  category,
  enabled,
  onToggle,
}: {
  category: BusEventCategory;
  enabled: boolean;
  onToggle: () => void;
}) {
  const style = CATEGORY_PILL_STYLES[category];
  return (
    <button
      onClick={onToggle}
      className="px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide transition-opacity"
      style={{
        backgroundColor: style.bg,
        color: style.fg,
        opacity: enabled ? 1 : 0.3,
      }}
    >
      {category}
    </button>
  );
}

export function BusEvents() {
  const busEvents = useStore((s) => s.busEvents);

  const [enabledCategories, setEnabledCategories] = useState<
    Set<BusEventCategory>
  >(() => new Set(ALL_CATEGORIES));
  const [selectedMessageTypes, setSelectedMessageTypes] = useState<Set<string>>(
    () => new Set<string>()
  );

  const availableMessageTypes = useMemo(() => {
    const s = new Set<string>();
    for (const e of busEvents) s.add(e.message_type);
    return Array.from(s).sort();
  }, [busEvents]);

  const filtered = useMemo(() => {
    if (
      enabledCategories.size === ALL_CATEGORIES.length &&
      selectedMessageTypes.size === 0
    ) {
      return busEvents;
    }
    return busEvents.filter((e) => {
      if (!enabledCategories.has(e.category)) return false;
      if (
        selectedMessageTypes.size > 0 &&
        !selectedMessageTypes.has(e.message_type)
      ) {
        return false;
      }
      return true;
    });
  }, [busEvents, enabledCategories, selectedMessageTypes]);

  const toggleCategory = (cat: BusEventCategory) => {
    setEnabledCategories((curr) => {
      const next = new Set(curr);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleMessageType = (mt: string) => {
    setSelectedMessageTypes((curr) => {
      const next = new Set(curr);
      if (next.has(mt)) next.delete(mt);
      else next.add(mt);
      return next;
    });
  };

  const clearMessageTypes = () => setSelectedMessageTypes(new Set());

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 8,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 28,
  });

  return (
    <Card className="flex flex-col min-h-0 overflow-hidden h-full">
      <CardHeader className="pb-2 flex-shrink-0 px-4 pt-4">
        <CardTitle className="text-sm text-muted-foreground truncate">
          Bus messages
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden p-2">
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center gap-2 pb-2 flex-shrink-0 flex-wrap">
            {ALL_CATEGORIES.map((cat) => (
              <CategoryToggle
                key={cat}
                category={cat}
                enabled={enabledCategories.has(cat)}
                onToggle={() => toggleCategory(cat)}
              />
            ))}
            <SearchableFilterDropdown
              label="All messages"
              placeholder="Search messages..."
              availableItems={availableMessageTypes}
              selectedItems={selectedMessageTypes}
              onToggle={toggleMessageType}
              onClear={clearMessageTypes}
              formatLabel={stripBusPrefix}
            />
            <span className="text-[11px] text-muted-foreground font-normal">
              {filtered.length} out of {busEvents.length}
            </span>
          </div>
          <div className="border border-dashed rounded-lg p-1 overflow-hidden flex flex-col flex-1 min-h-0 my-1">
            <div
              ref={parentRef}
              className="flex-1 min-h-0 overflow-auto"
              style={{ contain: "strict" }}
            >
        {filtered.length === 0 ? (
          <div className="text-muted-foreground text-xs p-2">
            {busEvents.length === 0
              ? "No bus messages yet."
              : "No messages match the current filter."}
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const ev = filtered[virtualItem.index];
              return (
                <div
                  key={`bus-${ev.timestamp}-${virtualItem.index}`}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <BusEventItem event={ev} />
                </div>
              );
            })}
          </div>
        )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
